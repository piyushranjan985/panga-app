import { requirePageAccess } from '@/lib/pageGuard';
import { hasPermission } from '@/lib/rbac';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import { listPlanCatalog } from '@/lib/payments/plans';
import { formatInr } from '@/lib/payments/money';
import { FEATURE_LABELS, type FeatureKey } from '@/lib/payments/types';
import CreatePlanVersionForm from '@/components/CreatePlanVersionForm';
import PlanActiveToggle from '@/components/PlanActiveToggle';

export default async function PaymentsPlansPage() {
  const admin = await requirePageAccess('payments.view');
  const canManage = hasPermission(admin.role, 'payments.manage');
  const catalog = await listPlanCatalog();

  return (
    <div>
      <PageHeader
        title="Plans & pricing"
        description="Editing a plan never changes an existing row -- it creates a new version and deactivates the old one, so subscribers already on a plan keep the terms they bought."
        actions={canManage ? <CreatePlanVersionForm /> : undefined}
      />
      <div className="space-y-6 p-8">
        {catalog.length === 0 && (
          <EmptyState
            title="No plans configured yet"
            description="Create the first plan version above -- Subscription (Plus/Premium per intent) or Credit pack (one-off power features)."
          />
        )}

        {catalog.map(({ slug, versions }) => {
          const current = versions.find((v) => v.isActive) ?? versions[0];
          if (!current) return null;
          return (
            <div key={slug} className="rounded-card border border-border bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold">{current.name}</p>
                    <Badge tone={current.isActive ? 'success' : 'default'}>{current.isActive ? 'Active' : 'Inactive'}</Badge>
                    <Badge tone="brand">{current.kind === 'SUBSCRIPTION' ? 'Subscription' : 'Credit pack'}</Badge>
                    {current.intent && <Badge>{current.intent}</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-inkSoft">{current.description || 'No description.'}</p>
                  <p className="mt-2 text-lg font-bold tabular-nums">
                    {formatInr(current.priceInPaise)}
                    {current.billingInterval && <span className="text-sm font-normal text-inkFaint"> / {current.billingInterval.toLowerCase()}</span>}
                    {current.creditAmount && <span className="text-sm font-normal text-inkFaint"> for {current.creditAmount} credits</span>}
                  </p>
                  {current.kind === 'SUBSCRIPTION' && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {Object.entries((current.features ?? {}) as Partial<Record<FeatureKey, boolean>>)
                        .filter(([, on]) => on)
                        .map(([key]) => (
                          <Badge key={key} tone="info">
                            {FEATURE_LABELS[key as FeatureKey] ?? key}
                          </Badge>
                        ))}
                    </div>
                  )}
                </div>
                {canManage && (
                  <div className="flex flex-col items-end gap-2">
                    <CreatePlanVersionForm existingSlug={slug} />
                    <PlanActiveToggle planId={current.id} isActive={current.isActive} />
                  </div>
                )}
              </div>

              {versions.length > 1 && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-xs font-semibold text-inkSoft">
                    Version history ({versions.length})
                  </summary>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-left text-inkFaint">
                        <tr>
                          <th className="py-1 pr-4">Version</th>
                          <th className="py-1 pr-4">Price</th>
                          <th className="py-1 pr-4">Status</th>
                          <th className="py-1 pr-4">Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {versions.map((v) => (
                          <tr key={v.id} className="border-t border-border">
                            <td className="py-1 pr-4 tabular-nums">v{v.version}</td>
                            <td className="py-1 pr-4 tabular-nums">{formatInr(v.priceInPaise)}</td>
                            <td className="py-1 pr-4">{v.isActive ? 'Active' : 'Superseded'}</td>
                            <td className="py-1 pr-4">{v.createdAt.toISOString().slice(0, 10)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
