import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';
import { toCsv, csvResponse } from '@/lib/csv';
import type { Prisma } from '@prisma/client';

// Same filters as app/(console)/privacy/consents/page.tsx. Gated on the
// generic reporting.export permission, same as every other list-level
// export in this portal (see lib/csv.ts's comment) -- a bulk export of
// who has/hasn't granted which consent is a bigger exposure than viewing
// 200 rows at a time in the UI, which privacy.consents.view alone covers.
export async function GET(req: Request) {
  const guard = await requirePermission('reporting.export');
  if ('error' in guard) return guard.error;
  const { admin } = guard;

  const { searchParams } = new URL(req.url);
  const purpose = searchParams.get('purpose');
  const status = searchParams.get('status');
  const userId = searchParams.get('userId');

  const where: Prisma.ConsentRecordWhereInput = {};
  const and: Prisma.ConsentRecordWhereInput[] = [];
  if (purpose) and.push({ purpose: purpose as never });
  if (status) and.push({ status: status as never });
  if (userId) and.push({ userId });
  if (and.length > 0) where.AND = and;

  const records = await db.consentRecord.findMany({
    where,
    include: { user: { include: { profile: { select: { displayName: true } } } } },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });

  const header = ['Record ID', 'User', 'User ID', 'Purpose', 'Status', 'Notice version', 'Source', 'Recorded'];
  const rows = records.map((r) => [
    r.id,
    r.user.profile?.displayName ?? '',
    r.userId,
    r.purpose,
    r.status,
    r.noticeVersion,
    r.source,
    r.createdAt.toISOString(),
  ]);
  const csv = toCsv(header, rows);

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'privacyConsents.export',
    category: 'privacy',
    newValue: { count: records.length, filters: Object.fromEntries(searchParams) },
    context: await getRequestContext(),
  });

  return csvResponse(csv, 'consent-records');
}
