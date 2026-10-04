import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';
import { toCsv, csvResponse } from '@/lib/csv';

// Breach/security incident register -- app/(console)/privacy/incidents/
// page.tsx has no filters, so this exports the same unfiltered list the
// page shows (DPDP Rules, 2025 breach-notification tracking).
export async function GET() {
  const guard = await requirePermission('reporting.export');
  if ('error' in guard) return guard.error;
  const { admin } = guard;

  const incidents = await db.privacyIncident.findMany({
    orderBy: [{ status: 'asc' }, { detectedAt: 'desc' }],
    take: 5000,
  });

  const header = ['Incident ID', 'Title', 'Severity', 'Status', 'Affected users (count)', 'Affected data categories', 'Detected', 'Contained', 'Board notified', 'Users notified'];
  const rows = incidents.map((i) => [
    i.id,
    i.title,
    i.severity,
    i.status,
    i.affectedUserCount ?? '',
    i.affectedDataCategories.join('; '),
    i.detectedAt.toISOString(),
    i.containedAt?.toISOString() ?? '',
    i.boardNotifiedAt?.toISOString() ?? '',
    i.usersNotifiedAt?.toISOString() ?? '',
  ]);
  const csv = toCsv(header, rows);

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'privacyIncidents.export',
    category: 'privacy',
    newValue: { count: incidents.length },
    context: await getRequestContext(),
  });

  return csvResponse(csv, 'privacy-incidents');
}
