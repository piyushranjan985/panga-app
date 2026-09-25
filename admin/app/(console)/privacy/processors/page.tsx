import { requirePageAccess } from '@/lib/pageGuard';
import { db } from '@/lib/db';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import ConfirmActionButton from '@/components/ConfirmActionButton';
import NewProcessorForm from '@/components/NewProcessorForm';
import { hasPermission } from '@/lib/rbac';

export default async function ProcessorsPage() {
  const admin = await requirePageAccess('privacy.view');
  const processors = await db.dataProcessor.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] });
  const canManage = hasPermission(admin.role, 'privacy.processors.manage');

  return (
    <div>
      <PageHeader title="Data Processors" description="Vendor register -- who else touches user data on findmyVybe's behalf, and why." />
      <div className="space-y-6 p-8">
        {canManage && <NewProcessorForm />}

        {processors.length === 0 ? (
          <EmptyState title="No processors on record" />
        ) : (
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-canvas text-left text-xs font-semibold uppercase tracking-wide text-inkFaint">
                <tr>
                  <th className="px-4 py-2.5">Vendor</th>
                  <th className="px-4 py-2.5">Purpose</th>
                  <th className="px-4 py-2.5">Data categories</th>
                  <th className="px-4 py-2.5">Country</th>
                  <th className="px-4 py-2.5">Status</th>
                  {canManage && <th className="px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody>
                {processors.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-canvas">
                    <td className="px-4 py-2.5 font-semibold">{p.name}</td>
                    <td className="px-4 py-2.5 text-inkSoft">{p.purpose}</td>
                    <td className="px-4 py-2.5 text-inkSoft">{p.dataCategories.join(', ') || '—'}</td>
                    <td className="px-4 py-2.5 text-inkSoft">{p.country}</td>
                    <td className="px-4 py-2.5"><Badge tone={p.active ? 'success' : 'default'}>{p.active ? 'Active' : 'Inactive'}</Badge></td>
                    {canManage && (
                      <td className="px-4 py-2.5">
                        <ConfirmActionButton
                          label={p.active ? 'Deactivate' : 'Reactivate'}
                          confirmTitle={p.active ? 'Deactivate this processor' : 'Reactivate this processor'}
                          endpoint={`/api/privacy/processors/${p.id}`}
                          method="PATCH"
                          extraBody={{ active: !p.active }}
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
