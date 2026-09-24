import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/apiGuard';
import { getAllTrends } from '@/lib/trends';

const querySchema = z.object({
  granularity: z.enum(['day', 'week', 'month', 'year']).default('day'),
});

export async function GET(req: Request) {
  const guard = await requirePermission('analytics.view');
  if ('error' in guard) return guard.error;

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({ granularity: searchParams.get('granularity') ?? undefined });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid granularity.' }, { status: 400 });
  }

  const trends = await getAllTrends(parsed.data.granularity);
  return NextResponse.json({ granularity: parsed.data.granularity, trends });
}
