import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';
import { toCsv, csvResponse } from '@/lib/csv';
import { matchingUserIds } from '@/lib/userSearch';
import { matchingUserIdsByAge, parseAgeBound } from '@/lib/ageFilter';
import type { Prisma } from '@prisma/client';

// Mirrors app/(console)/privacy/legal-holds/page.tsx's query.
export async function GET(req: Request) {
  const guard = await requirePermission('reporting.export');
  if ('error' in guard) return guard.error;
  const { admin } = guard;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim();
  const ageMin = parseAgeBound(searchParams.get('ageMin') ?? undefined);
  const ageMax = parseAgeBound(searchParams.get('ageMax') ?? undefined);

  const where: Prisma.LegalHoldWhereInput = {};
  const and: Prisma.LegalHoldWhereInput[] = [];
  if (q) and.push({ userId: { in: await matchingUserIds(q) } });
  if (ageMin != null || ageMax != null) {
    const ids = await matchingUserIdsByAge(ageMin, ageMax);
    if (ids) and.push({ userId: { in: ids } });
  }
  if (and.length > 0) where.AND = and;

  const holds = await db.legalHold.findMany({
    where,
    include: { user: { include: { profile: { select: { displayName: true } } } }, requestedBy: { select: { name: true } } },
    orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
    take: 5000,
  });

  const header = ['Hold ID', 'User', 'User ID', 'Reason', 'Requested by', 'Status', 'Placed', 'Released'];
  const rows = holds.map((h) => [
    h.id,
    h.user?.profile?.displayName ?? '',
    h.userId ?? '',
    h.reason,
    h.requestedBy.name,
    h.active ? 'Active' : 'Released',
    h.createdAt.toISOString(),
    h.releasedAt?.toISOString() ?? '',
  ]);
  const csv = toCsv(header, rows);

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'privacyLegalHolds.export',
    category: 'privacy',
    newValue: { count: holds.length, filters: Object.fromEntries(searchParams) },
    context: await getRequestContext(),
  });

  return csvResponse(csv, 'legal-holds');
}
