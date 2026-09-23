import { requirePageAccess } from '@/lib/pageGuard';
import { db } from '@/lib/db';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import Link from 'next/link';
import { getLiveSignals } from '@/lib/liveSignals';
import { LogAlertButton, AcknowledgeButton } from '@/components/AlertActions';
import { hasPermission } from '@/lib/rbac';

const SEVERITY_TONE: Record<string, 'default' | 'warning' | 'critical'> = { INFO: 'default', WARNING: 'warning', CRITICAL: 'critical' };

export default async function NotificationsPage() {
  const admin = await requirePageAccess('notifications.view');
  const canAcknowledge = hasPermission(admin.role, 'notifications.acknowledge');

  const [signals, openAlerts, recentlyAcknowledged] = await Promise.all([
    getLiveSignals(),
    db.opsAlert.findMany({ where: { acknowledgedAt: null }, orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }], take: 100 }),
    db.opsAlert.findMany({
      where: { acknowledgedAt: { not: null } },
      include: { acknowledgedBy: { select: { name: true } } },
      orderBy: { acknowledgedAt: 'desc' },
      take: 10,
    }),
  ]);

  const loggedSourceKeys = new Set(openAlerts.map((a) => `${a.sourceType}-${a.sourceId}`));
  const unloggedSignals = signals.filter((s) => !loggedSourceKeys.has(`${s.sourceType}-${s.sourceId}`));

  return (
    <div>
      <PageHeader title="Notifications & Operations" description="Live operational signals and the tracked alert queue." />
      <div className="space-y-8 p-8">
        <section>
          <h2 className="mb-3 text-sm font-bold">Detected now</h2>
          {unloggedSignals.length === 0 ? (
            <EmptyState title="No overdue items or open high-severity incidents right now" />
          ) : (
            <div className="space-y-2">
              {unloggedSignals.map((s) => (
                <div key={s.key} className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge tone={SEVERITY_TONE[s.severity]}>{s.severity}</Badge>
                      <Link href={s.href} className="truncate font-semibold text-brand hover:underline">{s.title}</Link>
                    </div>
                    <p className="mt-0.5 text-xs text-inkFaint">{s.detail}</p>
                  </div>
                  {canAcknowledge && <LogAlertButton signal={s} />}
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-bold">Open alerts</h2>
          {openAlerts.length === 0 ? (
            <EmptyState title="No open alerts" />
          ) : (
            <div className="overflow-hidden rounded-card border border-border bg-surface">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-canvas text-left text-xs font-semibold uppercase tracking-wide text-inkFaint">
                  <tr>
                    <th className="px-4 py-2.5">Title</th>
                    <th className="px-4 py-2.5">Category</th>
                    <th className="px-4 py-2.5">Severity</th>
                    <th className="px-4 py-2.5">Logged</th>
                    {canAcknowledge && <th className="px-4 py-2.5" />}
                  </tr>
                </thead>
                <tbody>
                  {openAlerts.map((a) => (
                    <tr key={a.id} className="border-b border-border last:border-0 hover:bg-canvas">
                      <td className="px-4 py-2.5">
                        <p className="font-semibold">{a.title}</p>
                        {a.detail && <p className="text-xs text-inkFaint">{a.detail}</p>}
                      </td>
                      <td className="px-4 py-2.5 text-inkSoft">{a.category.replace(/_/g, ' ')}</td>
                      <td className="px-4 py-2.5"><Badge tone={SEVERITY_TONE[a.severity]}>{a.severity}</Badge></td>
                      <td className="px-4 py-2.5 text-inkSoft">{a.createdAt.toISOString().slice(0, 16).replace('T', ' ')}</td>
                      {canAcknowledge && <td className="px-4 py-2.5"><AcknowledgeButton alertId={a.id} /></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {recentlyAcknowledged.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-bold text-inkFaint">Recently acknowledged</h2>
            <ul className="space-y-1 text-xs text-inkFaint">
              {recentlyAcknowledged.map((a) => (
                <li key={a.id}>{a.title} -- {a.acknowledgedBy?.name} at {a.acknowledgedAt?.toISOString().slice(0, 16).replace('T', ' ')}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
