import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';
import { toCsv, csvResponse } from '@/lib/csv';

// Exports the tracked OpsAlert queue -- both open and (up to 500) recently
// acknowledged -- as its own CSV. The "Detected now" section on the page
// is computed fresh from live tables (admin/lib/liveSignals.ts) rather
// than stored rows, so it isn't part of this export; turning one of those
// into a tracked alert (the page's "Log" button) is what puts it here.
export async function GET() {
  const guard = await requirePermission('reporting.export');
  if ('error' in guard) return guard.error;
  const { admin } = guard;

  const alerts = await db.opsAlert.findMany({
    include: { acknowledgedBy: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 2000,
  });

  const header = ['Alert ID', 'Title', 'Detail', 'Category', 'Severity', 'Source type', 'Source ID', 'Logged', 'Acknowledged', 'Acknowledged by'];
  const rows = alerts.map((a) => [
    a.id,
    a.title,
    a.detail ?? '',
    a.category,
    a.severity,
    a.sourceType,
    a.sourceId,
    a.createdAt.toISOString(),
    a.acknowledgedAt?.toISOString() ?? '',
    a.acknowledgedBy?.name ?? '',
  ]);
  const csv = toCsv(header, rows);

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'notifications.export',
    category: 'system',
    newValue: { count: alerts.length },
    context: await getRequestContext(),
  });

  return csvResponse(csv, 'ops-alerts');
}
