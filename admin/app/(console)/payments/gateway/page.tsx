import { requirePageAccess } from '@/lib/pageGuard';
import { hasPermission } from '@/lib/rbac';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import { ensureGatewayConfigRows } from '@/lib/payments/gatewayConfig';
import { getPaymentsAccess } from '@/lib/payments/flags';
import GatewayLiveToggle from '@/components/GatewayLiveToggle';

export default async function PaymentsGatewayPage() {
  const admin = await requirePageAccess('payments.view');
  const canManage = hasPermission(admin.role, 'payments.manage');
  const [gateways, access] = await Promise.all([ensureGatewayConfigRows(), Promise.resolve(getPaymentsAccess())]);

  return (
    <div>
      <PageHeader title="Gateway configuration" description="Display-only, non-secret planning settings. Real credentials live in environment variables, never here." />
      <div className="space-y-6 p-8">
        <div className={`rounded-card border p-4 text-sm ${access.liveGatewayActive ? 'border-critical/30 bg-criticalSoft' : 'border-border bg-canvas'}`}>
          <p className="font-bold">What actually controls live payments</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={access.freeTier ? 'info' : 'default'}>Free_Tier = {String(access.freeTier)}</Badge>
            <Badge tone={access.paymentMode === 'live' ? 'warning' : 'default'}>PAYMENT_MODE = {access.paymentMode}</Badge>
            <Badge tone={access.liveGatewayActive ? 'critical' : 'success'}>
              {access.liveGatewayActive ? 'Live gateway ACTIVE' : 'No live gateway can be reached'}
            </Badge>
          </div>
          <p className="mt-2 text-inkSoft">
            These three are plain server environment variables (Free_Tier, PAYMENT_MODE, LIVE_PAYMENTS_CONFIRMED) --
            nothing below on this page, and nothing else in this admin portal, can change them. They must be set and
            the app redeployed by someone with infrastructure access.
          </p>
        </div>

        <div className="overflow-x-auto rounded-card border border-border">
          <table className="w-full text-sm">
            <thead className="bg-canvas text-left text-xs text-inkFaint">
              <tr>
                <th className="px-4 py-2">Gateway</th>
                <th className="px-4 py-2">Planning status</th>
                <th className="px-4 py-2">Last updated</th>
                {canManage && <th className="px-4 py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {gateways.map((g) => (
                <tr key={g.id} className="border-t border-border">
                  <td className="px-4 py-2 font-semibold">{g.displayName}</td>
                  <td className="px-4 py-2">
                    <Badge tone={g.isEnabledForLive ? 'warning' : 'default'}>{g.gateway === 'MOCK' ? 'Always on' : g.isEnabledForLive ? 'Marked for live' : 'Planning only'}</Badge>
                  </td>
                  <td className="px-4 py-2 text-xs text-inkFaint">{g.updatedAt.toISOString().slice(0, 10)}</td>
                  {canManage && (
                    <td className="px-4 py-2">
                      <GatewayLiveToggle gateway={g.gateway} isEnabledForLive={g.isEnabledForLive} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="max-w-2xl text-xs text-inkFaint">
          Razorpay, Cashfree, and PayU have no live integration implemented in this build -- see
          lib/payments/razorpayAdapter.ts. Razorpay&apos;s merchant-category rules treat dating/matchmaking as
          restricted, subject to case-by-case approval; do not mark a gateway live without written confirmation from
          its onboarding team that FindMyVybe&apos;s business model is accepted.
        </p>
      </div>
    </div>
  );
}
