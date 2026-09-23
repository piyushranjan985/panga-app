'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminRole } from '@prisma/client';
import type { DashboardMetrics } from '@/lib/dashboardMetrics';
import { hasPermission } from '@/lib/rbac';
import StatTile from '@/components/StatTile';

const RANGE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
];

export default function DashboardClient({ role }: { role: AdminRole }) {
  const [range, setRange] = useState('7d');
  const [data, setData] = useState<DashboardMetrics | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch(`/api/dashboard/metrics?range=${range}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [range]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  function exportCsv() {
    if (!data) return;
    const rows: [string, string | number][] = [
      ['Total users', data.growth.totalUsers],
      ['New registrations', data.growth.newRegistrations],
      ['DAU', data.growth.dau],
      ['WAU', data.growth.wau],
      ['MAU', data.growth.mau],
      ['Online now (last 5 min)', data.growth.onlineNow],
      ['Completed profiles', data.profiles.completed],
      ['Incomplete profiles', data.profiles.incomplete],
      ['Verified users', data.profiles.verified],
      ['Verification failures', data.profiles.verificationFailures],
      ['Likes', data.matching.likes],
      ['Passes', data.matching.passes],
      ['Matches (range)', data.matching.matchesInRange],
      ['Total matches', data.matching.totalMatches],
      ['Unmatches', data.matching.unmatches],
      ['Match rate', `${(data.matching.matchRate * 100).toFixed(1)}%`],
      ['Messages (range)', data.engagement.messagesInRange],
      ['Ask About Me prompts sent', data.engagement.promptMessages],
      ['Make a Plan cards sent', data.engagement.planMessages],
      ['Reports (range)', data.safety.reportsInRange],
      ['Blocks (range)', data.safety.blocksInRange],
      ['Suspended users', data.safety.suspendedUsers],
      ['Banned users', data.safety.bannedUsers],
      ['Open support tickets', data.support.openTickets],
      ['Support tickets (range)', data.support.ticketsInRange],
    ];
    const csv = ['Metric,Value', ...rows.map(([k, v]) => `"${k}",${v}`)].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vybematch-dashboard-${range}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading || !data) {
    return <p className="text-sm text-inkSoft">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setRange(opt.value)}
              className={`rounded-md px-3 py-1 text-xs font-semibold ${
                range === opt.value ? 'bg-brand text-white' : 'text-inkSoft hover:bg-canvas'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-inkSoft">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            Auto-refresh (30s)
          </label>
          {hasPermission(role, 'reporting.export') && (
            <button onClick={exportCsv} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-inkSoft hover:bg-canvas">
              Export CSV
            </button>
          )}
        </div>
      </div>

      <Section title="Growth & activity">
        <StatTile label="Total users" value={data.growth.totalUsers} href="/users" />
        <StatTile label="New registrations" value={data.growth.newRegistrations} />
        <StatTile label="DAU" value={data.growth.dau} />
        <StatTile label="WAU" value={data.growth.wau} />
        <StatTile label="MAU" value={data.growth.mau} />
        <StatTile label="Active now" value={data.growth.onlineNow} sub="last 5 min, proxy metric" />
      </Section>

      <Section title="Profiles & verification">
        <StatTile label="Profiles completed" value={data.profiles.completed} />
        <StatTile label="Profiles incomplete" value={data.profiles.incomplete} sub="signed up, never finished onboarding" />
        <StatTile label="Verified users" value={data.profiles.verified} tone="success" />
        <StatTile label="Verification failures" value={data.profiles.verificationFailures} tone="warning" />
      </Section>

      <Section title="Matching">
        <StatTile label="Likes" value={data.matching.likes} />
        <StatTile label="Passes" value={data.matching.passes} />
        <StatTile label="Matches (range)" value={data.matching.matchesInRange} />
        <StatTile label="Total matches" value={data.matching.totalMatches} />
        <StatTile label="Match rate" value={`${(data.matching.matchRate * 100).toFixed(1)}%`} />
        <StatTile label="Unmatches" value={data.matching.unmatches} />
      </Section>

      <Section title="Engagement">
        <StatTile label="Messages sent" value={data.engagement.messagesInRange} />
        <StatTile label="Ask About Me prompts" value={data.engagement.promptMessages} />
        <StatTile label="Make a Plan cards" value={data.engagement.planMessages} />
      </Section>

      <Section title="Trust & Safety">
        <StatTile label="Reports filed" value={data.safety.reportsInRange} href="/reports" tone={data.safety.reportsInRange > 0 ? 'warning' : 'default'} />
        <StatTile label="Blocks" value={data.safety.blocksInRange} />
        <StatTile label="Suspended users" value={data.safety.suspendedUsers} href="/users?status=SUSPENDED" tone="warning" />
        <StatTile label="Banned users" value={data.safety.bannedUsers} href="/users?status=BANNED" tone="critical" />
      </Section>

      <Section title="Support">
        <StatTile label="Open tickets" value={data.support.openTickets} href="/support" />
        <StatTile label="Tickets (range)" value={data.support.ticketsInRange} />
      </Section>

      <div className="grid gap-6 sm:grid-cols-3">
        <Breakdown title="By city" rows={data.breakdowns.city} />
        <Breakdown title="By intent" rows={data.breakdowns.intent} />
        <Breakdown title="By platform (logins)" rows={data.breakdowns.platform} />
      </div>

      <p className="text-xs text-inkFaint">
        VybeMatch has no subscription or billing system yet, so revenue metrics aren&apos;t shown here -- see
        Payments for that section&apos;s current (not-yet-applicable) state. System health, API errors and failed
        jobs live on the System Health page.
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-bold text-inkSoft">{title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{children}</div>
    </div>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-inkFaint">{title}</p>
      <div className="mt-3 space-y-2">
        {rows.length === 0 && <p className="text-xs text-inkFaint">No data yet.</p>}
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex justify-between text-xs">
              <span className="text-inkSoft">{r.label}</span>
              <span className="tabular-nums font-semibold">{r.count}</span>
            </div>
            <div className="mt-0.5 h-1.5 rounded-full bg-canvas">
              <div className="h-1.5 rounded-full bg-brand" style={{ width: `${(r.count / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
