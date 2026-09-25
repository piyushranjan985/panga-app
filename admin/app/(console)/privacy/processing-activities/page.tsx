import { requirePageAccess } from '@/lib/pageGuard';
import { db } from '@/lib/db';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import NewProcessingActivityForm from '@/components/NewProcessingActivityForm';
import { hasPermission } from '@/lib/rbac';

export default async function ProcessingActivitiesPage() {
  const admin = await requirePageAccess('privacy.view');
  const activities = await db.processingActivity.findMany({ include: { owner: { select: { name: true } } }, orderBy: { name: 'asc' } });
  const canManage = hasPermission(admin.role, 'privacy.processingActivities.manage');

  return (
    <div>
      <PageHeader title="Processing Activities" description="The record-of-processing inventory -- what findmyVybe does with personal data, on what legal basis, and who it's shared with." />
      <div className="space-y-6 p-8">
        {canManage && <NewProcessingActivityForm />}

        {activities.length === 0 ? (
          <EmptyState title="No processing activities documented yet" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {activities.map((a) => (
              <div key={a.id} className="rounded-card border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{a.name}</p>
                  {a.dpiaRequired && <Badge tone="warning">DPIA required</Badge>}
                </div>
                <p className="mt-1 text-sm text-inkSoft">{a.purpose}</p>
                <dl className="mt-3 space-y-1 text-xs text-inkFaint">
                  <div><dt className="inline font-semibold">Legal basis: </dt><dd className="inline">{a.legalBasis}</dd></div>
                  {a.dataCategories.length > 0 && <div><dt className="inline font-semibold">Data: </dt><dd className="inline">{a.dataCategories.join(', ')}</dd></div>}
                  {a.recipients.length > 0 && <div><dt className="inline font-semibold">Shared with: </dt><dd className="inline">{a.recipients.join(', ')}</dd></div>}
                  {a.crossBorderTransfer && <div className="text-warning">Involves cross-border transfer</div>}
                </dl>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
