import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';
import { toCsv, csvResponse } from '@/lib/csv';
import { getGstSummary } from '@/lib/payments/reports';

export async function GET() {
  const guard = await requirePermission('reporting.export');
  if ('error' in guard) return guard.error;
  const { admin } = guard;

  const rows = await getGstSummary();
  const csv = toCsv(
    ['Invoice', 'Date', 'Subtotal (paise)', 'Discount (paise)', 'GST (paise)', 'Total (paise)', 'Place of supply', 'Mock'],
    rows.map((r) => [r.invoiceNumber, r.createdAt.toISOString().slice(0, 10), r.subtotalInPaise, r.discountInPaise, r.gstInPaise, r.totalInPaise, r.placeOfSupply ?? '', r.isMock]),
  );

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'payments.reports.gst_export',
    category: 'payments',
    newValue: { count: rows.length },
    context: await getRequestContext(),
  });

  return csvResponse(csv, 'gst-report');
}
