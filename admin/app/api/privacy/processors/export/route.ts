import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';
import { toCsv, csvResponse } from '@/lib/csv';

export async function GET() {
  const guard = await requirePermission('reporting.export');
  if ('error' in guard) return guard.error;
  const { admin } = guard;

  const processors = await db.dataProcessor.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] });

  const header = ['Processor ID', 'Vendor', 'Purpose', 'Data categories', 'Country', 'Status', 'Contract ref', 'DPA signed', 'Added'];
  const rows = processors.map((p) => [
    p.id,
    p.name,
    p.purpose,
    p.dataCategories.join('; '),
    p.country,
    p.active ? 'Active' : 'Inactive',
    p.contractRef ?? '',
    p.dpaSignedAt?.toISOString() ?? '',
    p.createdAt.toISOString(),
  ]);
  const csv = toCsv(header, rows);

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'privacyProcessors.export',
    category: 'privacy',
    newValue: { count: processors.length },
    context: await getRequestContext(),
  });

  return csvResponse(csv, 'data-processors');
}
