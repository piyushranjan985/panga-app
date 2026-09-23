import Link from 'next/link';
import { requirePageAccess } from '@/lib/pageGuard';
import { db } from '@/lib/db';
import PageHeader from '@/components/PageHeader';
import StatTile from '@/components/StatTile';

export default async function AnalyticsPage() {
  const admin = await requirePageAccess('analytics.view');

  const [verificationBreakdown, moderationByStatus, ticketsByCategory, deviceSplit] = await Promise.all([
    db.profile.groupBy({ by: ['verification'], _count: { _all: true } }),
    db.moderationCase.groupBy({ by: ['status'], _count: { _all: true } }),
    db.supportTicket.groupBy({ by: ['category'], _count: { _all: true } }),
    db.loginEvent.groupBy({ by: ['platform'], _count: { _all: true } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Analytics & Reporting"
        description="Cross-cutting reports. For the matching/conversation funnel specifically, see Matches & Engagement."
        actions={
          <a href="/api/users/export" className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-inkSoft hover:bg-canvas">
            Export users CSV
          </a>
        }
      />
      <div className="space-y-8 p-8">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <ReportCard title="Verification" rows={verificationBreakdown.map((v) => ({ label: v.verification, count: v._count._all }))} />
          <ReportCard title="Moderation cases" rows={moderationByStatus.map((v) => ({ label: v.status, count: v._count._all }))} />
          <ReportCard title="Support tickets by category" rows={ticketsByCategory.map((v) => ({ label: v.category, count: v._count._all }))} />
          <ReportCard title="Logins by platform" rows={deviceSplit.map((v) => ({ label: v.platform ?? 'unknown', count: v._count._all }))} />
        </div>

        <div className="rounded-card border border-border bg-surface p-5">
          <h2 className="mb-2 text-sm font-bold">Related reports</h2>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href="/dashboard" className="text-brand hover:underline">Operational dashboard</Link>
            <Link href="/engagement" className="text-brand hover:underline">Matching & conversation funnel</Link>
            <Link href="/audit-logs" className="text-brand hover:underline">Audit logs (exportable)</Link>
            {admin.role !== 'READ_ONLY' && <Link href="/users" className="text-brand hover:underline">User list (exportable)</Link>}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReportCard({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-inkFaint">{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-inkFaint">No data yet.</p>
      ) : (
        rows.map((r) => (
          <div key={r.label} className="flex justify-between border-b border-border py-1 text-sm last:border-0">
            <span className="text-inkSoft">{r.label}</span>
            <span className="tabular-nums font-semibold">{r.count}</span>
          </div>
        ))
      )}
    </div>
  );
}
