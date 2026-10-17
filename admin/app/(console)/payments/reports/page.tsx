import { requirePageAccess } from '@/lib/pageGuard';
import { hasPermission } from '@/lib/rbac';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import StatTile from '@/components/StatTile';
import { getGstSummary, getPromoUsageSummary } from '@/lib/payments/reports';
import { formatInr } from '@/lib/payments/money';

export default async function PaymentsReportsPage() {
  const admin = await requirePageAccess('payments.view');
  const canExport = hasPermission(admin.role, 'reporting.export');
  const [invoices, promos] = await Promise.all([getGstSummary(), getPromoUsageSummary()]);

  const totals = invoices.reduce(
    (acc, r) => ({ subtotal: acc.subtotal + r.subtotalInPaise, gst: acc.gst + r.gstInPaise, total: acc.total + r.totalInPaise }),
    { subtotal: 0, gst: 0, total: 0 },
  );

  return (
    <div>
      <PageHeader
        title="Reports & compliance"
        description="GST summary and promo-code usage, exportable for filing. Figures are mock while PAYMENT_MODE=mock -- every row below says so."
        actions={
          canExport ? (
            <a href="/api/payments/reports/gst" className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-inkSoft hover:bg-canvas">
              Export GST CSV
            </a>
          ) : undefined
        }
      />
      <div className="space-y-8 p-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile label="Invoices" value={invoices.length} />
          <StatTile label="Total GST collected" value={formatInr(totals.gst)} />
          <StatTile label="Total invoiced" value={formatInr(totals.total)} />
        </div>

        <div>
          <p className="mb-2 font-semibold">Invoices</p>
          {invoices.length === 0 ? (
            <EmptyState title="No invoices yet" />
          ) : (
            <div className="overflow-x-auto rounded-card border border-border">
              <table className="w-full text-sm">
                <thead className="bg-canvas text-left text-xs text-inkFaint">
                  <tr>
                    <th className="px-4 py-2">Invoice</th>
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2">Subtotal</th>
                    <th className="px-4 py-2">GST</th>
                    <th className="px-4 py-2">Total</th>
                    <th className="px-4 py-2">Place of supply</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.slice(0, 100).map((inv) => (
                    <tr key={inv.invoiceNumber} className="border-t border-border">
                      <td className="px-4 py-2 font-mono text-xs">{inv.invoiceNumber}</td>
                      <td className="px-4 py-2 text-xs text-inkFaint">{inv.createdAt.toISOString().slice(0, 10)}</td>
                      <td className="px-4 py-2 tabular-nums">{formatInr(inv.subtotalInPaise)}</td>
                      <td className="px-4 py-2 tabular-nums">{formatInr(inv.gstInPaise)}</td>
                      <td className="px-4 py-2 tabular-nums">{formatInr(inv.totalInPaise)}</td>
                      <td className="px-4 py-2">{inv.placeOfSupply ?? '—'}</td>
                      <td className="px-4 py-2">{inv.isMock && <Badge tone="warning">MOCK INVOICE</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 font-semibold">Promo codes</p>
          {promos.length === 0 ? (
            <EmptyState title="No promo codes yet" />
          ) : (
            <div className="overflow-x-auto rounded-card border border-border">
              <table className="w-full text-sm">
                <thead className="bg-canvas text-left text-xs text-inkFaint">
                  <tr>
                    <th className="px-4 py-2">Code</th>
                    <th className="px-4 py-2">Discount</th>
                    <th className="px-4 py-2">Redeemed</th>
                    <th className="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {promos.map((p) => (
                    <tr key={p.code} className="border-t border-border">
                      <td className="px-4 py-2 font-mono text-xs">{p.code}</td>
                      <td className="px-4 py-2">{p.discountType === 'PERCENT' ? `${p.discountValue}%` : formatInr(p.discountValue)}</td>
                      <td className="px-4 py-2 tabular-nums">
                        {p.redemptionCount}
                        {p.maxRedemptions ? ` / ${p.maxRedemptions}` : ''}
                      </td>
                      <td className="px-4 py-2">
                        <Badge tone={p.isActive ? 'success' : 'default'}>{p.isActive ? 'Active' : 'Inactive'}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="max-w-2xl text-xs text-inkFaint">
          This is directional GST math (see lib/payments/gst.ts), not a substitute for a CA&apos;s sign-off before any
          real invoice is issued. The supplier state used for the CGST+SGST vs. IGST split is a placeholder
          (GST_SUPPLIER_STATE_CODE) until FindMyVybe&apos;s actual GST-registered state is confirmed.
        </p>
      </div>
    </div>
  );
}
