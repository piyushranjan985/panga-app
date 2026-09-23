import { requirePageAccess } from '@/lib/pageGuard';
import { getEngagementMetrics } from '@/lib/engagementMetrics';
import PageHeader from '@/components/PageHeader';
import StatTile from '@/components/StatTile';

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

export default async function EngagementPage() {
  await requirePageAccess('analytics.view');
  const m = await getEngagementMetrics();

  return (
    <div>
      <PageHeader title="Matches & Engagement" description="The matching and conversation funnel, computed from live Swipe/Match/Message data." />
      <div className="space-y-8 p-8">
        <div>
          <h2 className="mb-3 text-sm font-bold text-inkSoft">Funnel</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatTile label="Likes" value={m.funnel.likes} />
            <StatTile label="Passes" value={m.funnel.passes} />
            <StatTile label="Matches" value={m.funnel.totalMatches} />
            <StatTile label="Match rate" value={pct(m.funnel.matchRate)} sub="matches / likes" />
            <StatTile label="Conversation start rate" value={pct(m.funnel.conversationStartRate)} sub="matches with a message" />
            <StatTile label="First-reply / response rate" value={pct(m.funnel.responseRate)} sub="both sides messaged" />
            <StatTile label="Avg conversation length" value={m.funnel.avgConversationLength.toFixed(1)} sub="messages per active match" />
            <StatTile label="Unmatch rate" value={pct(m.funnel.unmatchRate)} tone={m.funnel.unmatchRate > 0.2 ? 'warning' : 'default'} />
            <StatTile label="Report rate" value={pct(m.funnel.reportRate)} tone={m.funnel.reportRate > 0.05 ? 'warning' : 'default'} />
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-bold text-inkSoft">Feature usage (of matches with a conversation)</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatTile label="Make a Plan usage" value={pct(m.usage.datePlanUsageRate)} sub={`${m.usage.planCount} plans sent`} />
            <StatTile label="Ask About Me usage" value={pct(m.usage.sharedVybeUsageRate)} sub={`${m.usage.promptCount} prompts sent`} />
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="rounded-card border border-border bg-surface p-5">
            <h2 className="mb-3 text-sm font-bold">Intent conversion</h2>
            {m.segmentation.byIntent.map((i) => (
              <div key={i.label} className="flex justify-between border-b border-border py-1.5 text-sm last:border-0">
                <span className="text-inkSoft">{i.label}</span>
                <span className="tabular-nums font-semibold">{i.count}</span>
              </div>
            ))}
          </div>
          <div className="rounded-card border border-border bg-surface p-5">
            <h2 className="mb-3 text-sm font-bold">By city</h2>
            {m.segmentation.byCity.map((c) => (
              <div key={c.label} className="flex justify-between border-b border-border py-1.5 text-sm last:border-0">
                <span className="text-inkSoft">{c.label}</span>
                <span className="tabular-nums font-semibold">{c.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-card border border-border bg-surface p-5">
          <h2 className="mb-3 text-sm font-bold">Weekly retention cohorts</h2>
          <p className="mb-3 text-xs text-inkFaint">Share of each signup week still active (lastActiveAt) N weeks later.</p>
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-semibold uppercase tracking-wide text-inkFaint">
              <tr>
                <th className="py-1.5">Cohort week</th>
                <th className="py-1.5">Size</th>
                <th className="py-1.5">+1 week</th>
                <th className="py-1.5">+2 weeks</th>
                <th className="py-1.5">+4 weeks</th>
              </tr>
            </thead>
            <tbody>
              {m.cohorts.map((c) => (
                <tr key={c.week} className="border-t border-border">
                  <td className="py-1.5 text-inkSoft">{c.week}</td>
                  <td className="py-1.5 tabular-nums">{c.size}</td>
                  <td className="py-1.5 tabular-nums">{pct(c.week1)}</td>
                  <td className="py-1.5 tabular-nums">{pct(c.week2)}</td>
                  <td className="py-1.5 tabular-nums">{pct(c.week4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-inkFaint">
          No per-user &ldquo;compatibility score&rdquo; is computed or shown anywhere in this portal, by design -- see
          lib/matching.ts in the consumer app for the actual (transparent, reason-labelled) ranking logic.
        </p>
      </div>
    </div>
  );
}
