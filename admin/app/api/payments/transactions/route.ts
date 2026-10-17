import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import type { Prisma } from '@prisma/client';

export async function GET(req: Request) {
  const guard = await requirePermission('payments.view');
  if ('error' in guard) return guard.error;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const gateway = searchParams.get('gateway');

  const where: Prisma.TransactionWhereInput = {};
  if (status) where.status = status as never;
  if (gateway) where.gateway = gateway as never;

  const transactions = await db.transaction.findMany({
    where,
    include: { plan: { select: { name: true, slug: true } }, user: { select: { id: true, phone: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  return NextResponse.json({ transactions });
}
