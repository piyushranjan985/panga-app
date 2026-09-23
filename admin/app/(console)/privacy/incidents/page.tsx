import Link from 'next/link';
import { requirePageAccess } from '@/lib/pageGuard';
import { db } from '@/lib/db';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import NewIncidentForm from '@/components/NewIncidentForm';
import { hasPermission } from '@/lib/rbac';

const SEVERITY_TONE: Record<string, 'default' | 'success' | 'warning' | 'critical'> = {
  LOW: 'default',
  MEDIUM: 'warning',
  HIGH: 'warning',
  CRITICAL: 'critical',
};

const STATUS_TONE: Record<string, 'default' | 'success' | 'warning' | 'critical' | 'info'> = {
  DETECTED: 'critical',
  ASSESSING: 'warning',
  CONTAINED: 'info',
  BOARD_NOTIFIED: 'info',
  USERS_NOTIFIED: 'info',
  CLOSED: 'success',
};

export default async function IncidentsPage() {
  const admin = await requirePageAccess('privacy.view');

  const incidents = await db.privacyIncident.findMany({
    orderBy: [{ status: 'asc' }, { detectedAt: 'desc' }],
    take: 100,
  });

  return (
    <div>
      <PageHeader
        title="Privacy & Security Incidents"
        description="Breach assessment, containment, and Data Protection Board notification tracking, per the DPDP Rules 2025 breach-notification requirements."
      />
      <div className="space-y-6 p-8">
        {hasPermission(admin.role, 'privacy.incidents.manage') && <NewIncidentForm />}

        {incidents.length === 0 ? (
          <EmptyState title="No incidents on record" description="That's a good thing -- this is where a breach or security incident would be tracked from detection through Board notification." />
        ) : (
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-canvas text-left text-xs font-semibold uppercase tracking-wide text-inkFaint">
                <tr>
                  <th className="px-4 py-2.5">Title</th>
                  <th className="px-4 py-2.5">Severity</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Affected users</th>
                  <th className="px-4 py-2.5">Detected</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((i) => (
                  <tr key={i.id} className="border-b border-border last:border-0 hover:bg-canvas">
                    <td className="px-4 py-2.5">
                      <Link href={`/privacy/incidents/${i.id}`} className="font-semibold text-brand hover:underline">
                        {i.title}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5"><Badge tone={SEVERITY_TONE[i.severity]}>{i.severity}</Badge></td>
                    <td className="px-4 py-2.5"><Badge tone={STATUS_TONE[i.status]}>{i.status.replace(/_/g, ' ')}</Badge></td>
                    <td className="px-4 py-2.5 text-inkSoft">{i.affectedUserCount ?? '—'}</td>
                    <td className="px-4 py-2.5 text-inkSoft">{i.detectedAt.toISOString().slice(0, 10)}</td>
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
