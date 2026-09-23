import { requirePageAccess } from '@/lib/pageGuard';
import { db } from '@/lib/db';
import PageHeader from '@/components/PageHeader';
import StatTile from '@/components/StatTile';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';

// Everything on this page is a live, real signal -- a database round trip
// timed just now, and counts from the actual tables -- never a fabricated
// uptime percentage or job-queue depth. There is no background job
// runner and no external monitoring integration in this build, so this
// page does not claim to show either; it shows what a Postgres-backed
// Next.js app on Vercel can actually report about itself: is the database
// reachable, how fast, and what does open SYSTEM/OUTAGE-category alert
// traffic look like.
export default async function SystemHealthPage() {
  await requirePageAccess('systemHealth.view');

  const dbStart = Date.now();
  let dbOk = true;
  let dbError: string | null = null;
  try {
    await db.$queryRaw`SELECT 1`;
  } catch (err) {
    dbOk = false;
    dbError = err instanceof Error ? err.message : 'Unknown error';
  }
  const dbLatencyMs = Date.now() - dbStart;

  const [userCount, activeAdminSessions, openSystemAlerts, recentFailedLogins] = await Promise.all([
    db.user.count(),
    db.adminSession.count({ where: { expiresAt: { gt: new Date() }, revokedAt: null } }),
    db.opsAlert.findMany({
      where: { acknowledgedAt: null, category: { in: ['SYSTEM', 'OUTAGE'] } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    db.adminUser.count({ where: { failedLoginAttempts: { gt: 0 } } }),
  ]);

  return (
    <div>
      <PageHeader title="System Health" description="Live checks against the real database -- no synthetic uptime or job-queue metrics, since neither exists in this build." />
      <div className="space-y-8 p-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-card border border-border bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-inkFaint">Database</p>
            <p className="mt-2"><Badge tone={dbOk ? 'success' : 'critical'}>{dbOk ? 'Reachable' : 'Unreachable'}</Badge></p>
            <p className="mt-1 text-xs text-inkFaint">{dbOk ? `${dbLatencyMs}ms round trip just now` : dbError}</p>
          </div>
          <StatTile label="Total users" value={userCount} />
          <StatTile label="Active admin sessions" value={activeAdminSessions} />
          <StatTile label="Admins with recent failed logins" value={recentFailedLogins} tone={recentFailedLogins > 0 ? 'warning' : 'default'} />
        </div>

        <section>
          <h2 className="mb-3 text-sm font-bold">Open system / outage alerts</h2>
          {openSystemAlerts.length === 0 ? (
            <EmptyState title="No open system or outage alerts" />
          ) : (
            <div className="space-y-2">
              {openSystemAlerts.map((a) => (
                <div key={a.id} className="rounded-card border border-border bg-surface p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge tone={a.severity === 'CRITICAL' ? 'critical' : 'warning'}>{a.severity}</Badge>
                    <p className="font-semibold">{a.title}</p>
                  </div>
                  {a.detail && <p className="mt-1 text-xs text-inkFaint">{a.detail}</p>}
                </div>
              ))}
            </div>
          )}
        </section>

        <p className="max-w-2xl text-xs text-inkFaint">
          This app runs on Vercel's serverless platform, where a single process&apos;s uptime isn&apos;t a meaningful
          health signal (functions start and stop per request) -- deployment status and infrastructure-level
          metrics live in the Vercel dashboard, not here. This page covers what the application itself can verify:
          its own database connection and the alerts operators have logged against it.
        </p>
      </div>
    </div>
  );
}
