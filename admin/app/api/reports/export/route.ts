import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';
import { toCsv, csvResponse } from '@/lib/csv';

// Mirrors app/(console)/reports/page.tsx's query -- every report a user
// has filed, cross-referenced with whatever moderation case it became (if
// any). Gated on reporting.export (same generic export permission as
// Dashboard/Audit Logs), on top of the moderation.view the page itself
// already requires to be visible.
export async function GET() {
  const guard = await requirePermission('reporting.export');
  if ('error' in guard) return guard.error;
  const { admin } = guard;

  const reports = await db.report.findMany({
    include: {
      reporter: { include: { profile: { select: { displayName: true } } } },
      about: { include: { profile: { select: { displayName: true } } } },
      moderationCases: { select: { id: true, status: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });

  const header = ['Report ID', 'Reported user', 'Reported user ID', 'Reporter', 'Reporter ID', 'Reason', 'Details', 'Case ID', 'Case status', 'Filed'];
  const rows = reports.map((r) => [
    r.id,
    r.about.profile?.displayName ?? '',
    r.aboutId,
    r.reporter.profile?.displayName ?? '',
    r.reporterId,
    r.reason,
    r.details,
    r.moderationCases[0]?.id ?? '',
    r.moderationCases[0]?.status ?? '',
    r.createdAt.toISOString(),
  ]);
  const csv = toCsv(header, rows);

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'reports.export',
    category: 'moderation',
    newValue: { count: reports.length },
    context: await getRequestContext(),
  });

  return csvResponse(csv, 'reports');
}
