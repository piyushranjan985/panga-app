import Link from 'next/link';
import { requirePageAccess } from '@/lib/pageGuard';
import { db } from '@/lib/db';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import ConfirmActionButton from '@/components/ConfirmActionButton';
import NewLegalHoldForm from '@/components/NewLegalHoldForm';
import { hasPermission } from '@/lib/rbac';

export default async function LegalHoldsPage() {
  const admin = await requirePageAccess('privacy.view');
  const holds = await db.legalHold.findMany({
    include: { user: { include: { profile: { select: { displayName: true } } } }, requestedBy: { select: { name: true } } },
    orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
    take: 100,
  });
  const canManage = hasPermission(admin.role, 'privacy.legalHolds.manage');

  return (
    <div>
      <PageHeader title="Legal Holds" description="A hold blocks a DPDP deletion request from being completed against that user's account until it's released." />
      <div className="space-y-6 p-8">
        {canManage && <NewLegalHoldForm />}

        {holds.length === 0 ? (
          <EmptyState title="No legal holds on record" />
        ) : (
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-canvas text-left text-xs font-semibold uppercase tracking-wide text-inkFaint">
                <tr>
                  <th className="px-4 py-2.5">User</th>
                  <th className="px-4 py-2.5">Reason</th>
                  <th className="px-4 py-2.5">Requested by</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Placed</th>
                  {canManage && <th className="px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody>
                {holds.map((h) => (
                  <tr key={h.id} className="border-b border-border last:border-0 hover:bg-canvas">
                    <td className="px-4 py-2.5">
                      {h.userId ? (
                        <Link href={`/users/${h.userId}`} className="font-semibold text-brand hover:underline">
                          {h.user?.profile?.displayName ?? h.userId}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-inkSoft">{h.reason}</td>
                    <td className="px-4 py-2.5 text-inkSoft">{h.requestedBy.name}</td>
                    <td className="px-4 py-2.5"><Badge tone={h.active ? 'critical' : 'default'}>{h.active ? 'Active' : 'Released'}</Badge></td>
                    <td className="px-4 py-2.5 text-inkSoft">{h.createdAt.toISOString().slice(0, 10)}</td>
                    {canManage && (
                      <td className="px-4 py-2.5">
                        {h.active && (
                          <ConfirmActionButton
                            label="Release"
                            confirmTitle="Release this legal hold"
                            confirmDescription="The user's account becomes eligible for a pending DPDP deletion request again."
                            endpoint={`/api/privacy/legal-holds/${h.id}`}
                            method="PATCH"
                            requireReason={false}
                            requireStepUp
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
