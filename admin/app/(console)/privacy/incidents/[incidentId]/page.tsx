import { notFound } from 'next/navigation';
import { requirePageAccess } from '@/lib/pageGuard';
import { db } from '@/lib/db';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import IncidentControls from '@/components/IncidentControls';
import IncidentNoteForm from '@/components/IncidentNoteForm';
import { hasPermission } from '@/lib/rbac';

const SEVERITY_TONE: Record<string, 'default' | 'success' | 'warning' | 'critical'> = {
  LOW: 'default',
  MEDIUM: 'warning',
  HIGH: 'warning',
  CRITICAL: 'critical',
};

export default async function IncidentDetailPage({ params }: { params: Promise<{ incidentId: string }> }) {
  const admin = await requirePageAccess('privacy.view');
  const { incidentId } = await params;

  const incident = await db.privacyIncident.findUnique({
    where: { id: incidentId },
    include: {
      owner: { select: { name: true } },
      timeline: { include: { author: { select: { name: true } } }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!incident) notFound();

  const canManage = hasPermission(admin.role, 'privacy.incidents.manage');

  return (
    <div>
      <PageHeader
        title={incident.title}
        description={`Detected ${incident.detectedAt.toISOString().slice(0, 10)}${incident.owner ? ` -- owner: ${incident.owner.name}` : ''}`}
        actions={<Badge tone={SEVERITY_TONE[incident.severity]}>{incident.severity}</Badge>}
      />
      <div className="grid gap-6 p-8 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-card border border-border bg-surface p-5 text-sm">
            <p className="whitespace-pre-wrap">{incident.description}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <p><span className="text-inkFaint">Status:</span> <Badge>{incident.status.replace(/_/g, ' ')}</Badge></p>
              <p><span className="text-inkFaint">Affected users:</span> {incident.affectedUserCount ?? 'Unknown'}</p>
              {incident.affectedDataCategories.length > 0 && (
                <p className="sm:col-span-2">
                  <span className="text-inkFaint">Data categories:</span> {incident.affectedDataCategories.join(', ')}
                </p>
              )}
              {incident.containedAt && <p><span className="text-inkFaint">Contained:</span> {incident.containedAt.toISOString().slice(0, 10)}</p>}
              {incident.boardNotifiedAt && <p><span className="text-inkFaint">Board notified:</span> {incident.boardNotifiedAt.toISOString().slice(0, 10)}</p>}
              {incident.usersNotifiedAt && <p><span className="text-inkFaint">Users notified:</span> {incident.usersNotifiedAt.toISOString().slice(0, 10)}</p>}
            </div>
            {incident.rootCause && (
              <p className="mt-3 text-inkSoft"><span className="font-semibold text-ink">Root cause:</span> {incident.rootCause}</p>
            )}
            {incident.remediation && (
              <p className="mt-1 text-inkSoft"><span className="font-semibold text-ink">Remediation:</span> {incident.remediation}</p>
            )}
          </div>

          <div className="rounded-card border border-border bg-surface p-5">
            <h2 className="text-sm font-bold">Timeline</h2>
            <ol className="mt-3 space-y-3 border-l border-border pl-4">
              {incident.timeline.map((e) => (
                <li key={e.id} className="text-sm">
                  <p>{e.note}</p>
                  <p className="text-xs text-inkFaint">
                    {e.createdAt.toISOString().slice(0, 16).replace('T', ' ')} {e.author ? `-- ${e.author.name}` : ''}
                  </p>
                </li>
              ))}
            </ol>
          </div>

          {canManage && <IncidentNoteForm incidentId={incident.id} />}
        </div>

        {canManage && (
          <div>
            <div className="rounded-card border border-border bg-surface p-5">
              <h2 className="mb-3 text-sm font-bold">Advance status</h2>
              <IncidentControls incidentId={incident.id} status={incident.status} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
