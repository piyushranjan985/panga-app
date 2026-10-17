import { requirePageAccess } from '@/lib/pageGuard';
import { hasPermission } from '@/lib/rbac';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import { listSubscriptions } from '@/lib/payments/subscriptions';
import { formatInr } from '@/lib/payments/money';
import ConfirmActionButton from '@/components/ConfirmActionButton';

const STATUS_TONE: Record<string, 'default' | 'success' | 'warning' | 'critical'> = {
  ACTIVE: 'success',
  GRACE: 'warning',
  EXPIRED: 'default',
  CANCELLED: 'critical',
};

export default async function PaymentsSubscriptionsPage() {
  const admin = await requirePageAccess('payments.view');
  const canOverride = hasPermission(admin.role, 'payments.subscriptions.override');
  const subscriptions = await listSubscriptions();

  return (
    <div>
      <PageHeader title="Subscriptions" description="Per-user subscription state. A cancel keeps entitlements through the current period unless marked immediate." />
      <div className="p-8">
        {subscriptions.length === 0 ? (
          <EmptyState title="No subscriptions yet" description="They appear here the moment a mock (or real) checkout succeeds." />
        ) : (
          <div className="overflow-x-auto rounded-card border border-border">
            <table className="w-full text-sm">
              <thead className="bg-canvas text-left text-xs text-inkFaint">
                <tr>
                  <th className="px-4 py-2">User</th>
                  <th className="px-4 py-2">Plan</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Period end</th>
                  <th className="px-4 py-2">Price</th>
                  {canOverride && <th className="px-4 py-2">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-4 py-2">{s.user.profile?.displayName ?? s.userId}</td>
                    <td className="px-4 py-2">{s.plan.name}</td>
                    <td className="px-4 py-2">
                      <Badge tone={STATUS_TONE[s.status] ?? 'default'}>{s.status}</Badge>
                      {s.cancelAtPeriodEnd && s.status === 'ACTIVE' && (
                        <span className="ml-1 text-xs text-inkFaint">(cancels at period end)</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-inkFaint">{s.currentPeriodEnd.toISOString().slice(0, 10)}</td>
                    <td className="px-4 py-2 tabular-nums">{formatInr(s.plan.priceInPaise)}</td>
                    {canOverride && (
                      <td className="px-4 py-2">
                        {s.status === 'ACTIVE' && (
                          <ConfirmActionButton
                            label="Cancel"
                            confirmTitle={`Cancel ${s.user.profile?.displayName ?? s.userId}'s subscription?`}
                            confirmDescription="Cancels immediately and revokes entitlements right away -- use this for a refund-triggered revoke, not a routine non-renewal."
                            endpoint={`/api/payments/subscriptions/${s.id}/override`}
                            extraBody={{ action: 'cancelImmediately' }}
                            requireStepUp
                            tone="critical"
                          />
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
