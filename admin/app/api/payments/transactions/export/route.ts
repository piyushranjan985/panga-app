import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';
import { toCsv, csvResponse } from '@/lib/csv';
import type { Prisma } from '@prisma/client';

export async function GET(req: Request) {
  const guard = await requirePermission('reporting.export');
  if ('error' in guard) return guard.error;
  const { admin } = guard;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const where: Prisma.TransactionWhereInput = status ? { status: status as never } : {};

  const transactions = await db.transaction.findMany({
    where,
    include: { plan: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });

  const csv = toCsv(
    ['Transaction ID', 'User ID', 'Plan', 'Gateway', 'Status', 'Amount (paise)', 'Discount (paise)', 'GST (paise)', 'Total (paise)', 'Created'],
    transactions.map((t) => [t.id, t.userId, t.plan?.name ?? '', t.gateway, t.status, t.amountInPaise, t.discountInPaise, t.gstInPaise, t.totalInPaise, t.createdAt.toISOString()]),
  );

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'payments.transactions.export',
    category: 'payments',
    newValue: { count: transactions.length, filters: Object.fromEntries(searchParams) },
    context: await getRequestContext(),
  });

  return csvResponse(csv, 'transactions');
}
