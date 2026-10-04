import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';
import { toCsv, csvResponse } from '@/lib/csv';
import type { Prisma } from '@prisma/client';

// Same filters as app/(console)/moderation/page.tsx. Risk score is
// deliberately left out of the CSV regardless of role -- see
// lib/rbac.ts's moderation.viewRiskScore comment ("never expose internal
// risk/scoring algorithms") -- a bulk export is a bigger exposure surface
// than the one-row-at-a-time column the page already restricts by role.
export async function GET(req: Request) {
  const guard = await requirePermission('reporting.export');
  if ('error' in guard) return guard.error;
  const { admin } = guard;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const severity = searchParams.get('severity');
  const category = searchParams.get('category');

  const where: Prisma.ModerationCaseWhereInput = {};
  where.status = status ? (status as never) : { in: ['OPEN', 'IN_REVIEW', 'ESCALATED'] };
  if (severity) where.severity = severity as never;
  if (category) where.category = category;

  const cases = await db.moderationCase.findMany({
    where,
    include: { subjectUser: { include: { profile: { select: { displayName: true } } } }, assignee: { select: { name: true } } },
    orderBy: [{ severity: 'desc' }, { createdAt: 'asc' }],
    take: 5000,
  });

  const header = ['Case ID', 'Subject user', 'Subject user ID', 'Category', 'Source', 'Severity', 'Status', 'Repeat offender', 'Assignee', 'Opened'];
  const rows = cases.map((c) => [
    c.id,
    c.subjectUser.profile?.displayName ?? '',
    c.subjectUserId,
    c.category,
    c.sourceType,
    c.severity,
    c.status,
    c.isRepeatOffender ? 'Yes' : 'No',
    c.assignee?.name ?? 'Unassigned',
    c.createdAt.toISOString(),
  ]);
  const csv = toCsv(header, rows);

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'moderation.export',
    category: 'moderation',
    newValue: { count: cases.length, filters: Object.fromEntries(searchParams) },
    context: await getRequestContext(),
  });

  return csvResponse(csv, 'moderation-cases');
}
