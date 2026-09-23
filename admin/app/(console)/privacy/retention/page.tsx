import { requirePageAccess } from '@/lib/pageGuard';
import { db } from '@/lib/db';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import ConfirmActionButton from '@/components/ConfirmActionButton';
import NewRetentionPolicyForm from '@/components/NewRetentionPolicyForm';
import { hasPermission } from '@/lib/rbac';

export default async function RetentionPage() {
  const admin = await requirePageAccess('privacy.view');
  const policies = await db.retentionPolicy.findMany({ orderBy: { dataCategory: 'asc' } });
  const canManage = hasPermission(admin.role, 'privacy.retention.manage');

  return (
    <div>
      <PageHeader title="Retention Policies" description="How long each data category is kept, and whether it's slated for automatic deletion once that period ends." />
      <div className="space-y-6 p-8">
        {canManage && <NewRetentionPolicyForm />}

        {policies.length === 0 ? (
          <EmptyState title="No retention policies defined yet" />
        ) : (
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-canvas text-left text-xs font-semibold uppercase tracking-wide text-inkFaint">
                <tr>
                  <th className="px-4 py-2.5">Data category</th>
                  <th className="px-4 py-2.5">Retention</th>
                  <th className="px-4 py-2.5">Legal basis</th>
                  <th className="px-4 py-2.5">Auto-delete</th>
                  <th className="px-4 py-2.5">Last reviewed</th>
                  {canManage && <th className="px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody>
                {policies.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-canvas">
                    <td className="px-4 py-2.5 font-semibold">{p.dataCategory}</td>
                    <td className="px-4 py-2.5 text-inkSoft">{p.retentionDays} days</td>
                    <td className="px-4 py-2.5 text-inkSoft">{p.legalBasis || '—'}</td>
                    <td className="px-4 py-2.5"><Badge tone={p.autoDeleteEnabled ? 'warning' : 'default'}>{p.autoDeleteEnabled ? 'Enabled' : 'Manual review'}</Badge></td>
                    <td className="px-4 py-2.5 text-inkSoft">{p.lastReviewedAt ? p.lastReviewedAt.toISOString().slice(0, 10) : '—'}</td>
                    {canManage && (
                      <td className="px-4 py-2.5">
                        <ConfirmActionButton
                          label={p.autoDeleteEnabled ? 'Switch to manual review' : 'Enable auto-delete'}
                          confirmTitle={p.autoDeleteEnabled ? 'Switch this category to manual review' : 'Enable auto-delete for this category'}
                          confirmDescription={!p.autoDeleteEnabled ? 'No purge job runs yet -- this only flags intent for when one is built.' : undefined}
                          endpoint={`/api/privacy/retention/${p.id}`}
                          method="PATCH"
                          extraBody={{ autoDeleteEnabled: !p.autoDeleteEnabled }}
                          requireReason={false}
                        />
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
