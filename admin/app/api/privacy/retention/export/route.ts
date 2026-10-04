import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';
import { toCsv, csvResponse } from '@/lib/csv';

export async function GET() {
  const guard = await requirePermission('reporting.export');
  if ('error' in guard) return guard.error;
  const { admin } = guard;

  const policies = await db.retentionPolicy.findMany({ orderBy: { dataCategory: 'asc' } });

  const header = ['Policy ID', 'Data category', 'Retention (days)', 'Legal basis', 'Auto-delete', 'Last reviewed'];
  const rows = policies.map((p) => [
    p.id,
    p.dataCategory,
    p.retentionDays,
    p.legalBasis ?? '',
    p.autoDeleteEnabled ? 'Enabled' : 'Manual review',
    p.lastReviewedAt?.toISOString() ?? '',
  ]);
  const csv = toCsv(header, rows);

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'privacyRetention.export',
    category: 'privacy',
    newValue: { count: policies.length },
    context: await getRequestContext(),
  });

  return csvResponse(csv, 'retention-policies');
}
