import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';
import { toCsv, csvResponse } from '@/lib/csv';
import type { Prisma } from '@prisma/client';

// List-level export of DPDP data-principal requests (ACCESS, CORRECTION,
// DELETION, GRIEVANCE, PORTABILITY, CONSENT_WITHDRAWAL) -- same filters
// as app/(console)/privacy/requests/page.tsx. This is the register
// regulators/auditors ask for; the per-request "Export CSV" on the
// request detail page (app/api/privacy/requests/[requestId]/export) is a
// different thing -- that one compiles one data principal's actual data,
// this one is the request log itself.
export async function GET(req: Request) {
  const guard = await requirePermission('reporting.export');
  if ('error' in guard) return guard.error;
  const { admin } = guard;

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const status = searchParams.get('status');
  const overdue = searchParams.get('overdue');

  const where: Prisma.PrivacyRequestWhereInput = {};
  const and: Prisma.PrivacyRequestWhereInput[] = [];
  if (type) and.push({ type: type as never });
  if (overdue === '1') and.push({ dueAt: { lt: new Date() }, status: { in: ['RECEIVED', 'VERIFYING_IDENTITY', 'IN_PROGRESS'] } });
  else if (!status) and.push({ status: { in: ['RECEIVED', 'VERIFYING_IDENTITY', 'IN_PROGRESS', 'ON_HOLD_LEGAL'] } });
  if (status) and.push({ status: status as never });
  if (and.length > 0) where.AND = and;

  const requests = await db.privacyRequest.findMany({
    where,
    include: { user: { include: { profile: { select: { displayName: true } } } }, handledBy: { select: { name: true } } },
    orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
    take: 5000,
  });

  const header = ['Request ID', 'User', 'User ID', 'Type', 'Status', 'Due', 'Handler', 'Received'];
  const rows = requests.map((r) => [
    r.id,
    r.user?.profile?.displayName ?? r.contactEmail ?? '',
    r.userId ?? '',
    r.type,
    r.status,
    r.dueAt?.toISOString() ?? '',
    r.handledBy?.name ?? 'Unassigned',
    r.createdAt.toISOString(),
  ]);
  const csv = toCsv(header, rows);

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'privacyRequests.export',
    category: 'privacy',
    newValue: { count: requests.length, filters: Object.fromEntries(searchParams) },
    context: await getRequestContext(),
  });

  return csvResponse(csv, 'privacy-requests');
}
