import { db } from '@/lib/db';

// Matching & Product Analytics -- computed from real Swipe/Match/Message
// rows. Two honest gaps, called out rather than papered over: there's no
// "Discovery impression" event distinct from a swipe decision (the
// consumer app doesn't log a card view separately from the like/pass
// action), so the funnel starts at Likes, not Impressions; and this
// computes on-demand from live tables rather than a rollup, which is
// fine below tens of thousands of rows and the first thing to move to a
// nightly job if it ever isn't (see admin/docs/ARCHITECTURE.md).
export async function getEngagementMetrics() {
  const [likes, passes, totalMatches, matchesWithMessages, unmatches, reports, messageAgg, planCount, promptCount, byIntent, byCity] =
    await Promise.all([
      db.swipe.count({ where: { action: 'VYBE' } }),
      db.swipe.count({ where: { action: 'PASS' } }),
      db.match.count(),
      db.match.count({ where: { messages: { some: {} } } }),
      db.match.count({ where: { unmatchedAt: { not: null } } }),
      db.report.count(),
      db.message.groupBy({ by: ['matchId'], _count: { _all: true } }),
      db.message.count({ where: { kind: 'PLAN' } }),
      db.message.count({ where: { kind: 'PROMPT' } }),
      db.profile.groupBy({ by: ['intent'], _count: { _all: true } }),
      db.profile.groupBy({ by: ['city'], _count: { _all: true }, orderBy: { _count: { city: 'desc' } }, take: 6 }),
    ]);

  // "Response rate": of matches with >=1 message, how many have messages
  // from BOTH participants (a reply happened, not just an opener).
  const matchSenderCounts = await db.message.findMany({
    where: { matchId: { in: (await db.match.findMany({ where: { messages: { some: {} } }, select: { id: true } })).map((m) => m.id) } },
    select: { matchId: true, senderId: true },
    distinct: ['matchId', 'senderId'],
  });
  const sendersByMatch = new Map<string, number>();
  for (const row of matchSenderCounts) {
    sendersByMatch.set(row.matchId, (sendersByMatch.get(row.matchId) ?? 0) + 1);
  }
  const matchesWithReply = [...sendersByMatch.values()].filter((n) => n >= 2).length;

  const avgConversationLength =
    messageAgg.length > 0 ? messageAgg.reduce((sum, m) => sum + m._count._all, 0) / messageAgg.length : 0;

  const matchRate = likes > 0 ? totalMatches / likes : 0;
  const conversationStartRate = totalMatches > 0 ? matchesWithMessages / totalMatches : 0;
  const responseRate = matchesWithMessages > 0 ? matchesWithReply / matchesWithMessages : 0;
  const unmatchRate = totalMatches > 0 ? unmatches / totalMatches : 0;
  const reportRate = totalMatches > 0 ? reports / totalMatches : 0;
  const datePlanUsageRate = matchesWithMessages > 0 ? planCount / matchesWithMessages : 0;
  const sharedVybeUsageRate = matchesWithMessages > 0 ? promptCount / matchesWithMessages : 0;

  // Weekly registration cohorts, retention = active (lastActiveAt) at
  // least `n` weeks after signup -- a straightforward cohort table, not a
  // full behavioral-retention pipeline.
  const cohortUsers = await db.user.findMany({ select: { createdAt: true, lastActiveAt: true }, orderBy: { createdAt: 'asc' } });
  const cohorts = buildWeeklyCohorts(cohortUsers);

  return {
    funnel: { likes, passes, totalMatches, matchRate, matchesWithMessages, conversationStartRate, matchesWithReply, responseRate, avgConversationLength, unmatches, unmatchRate, reports, reportRate },
    usage: { datePlanUsageRate, sharedVybeUsageRate, planCount, promptCount },
    segmentation: {
      byIntent: byIntent.map((i) => ({ label: i.intent, count: i._count._all })),
      byCity: byCity.map((c) => ({ label: c.city, count: c._count._all })),
    },
    cohorts,
  };
}

function buildWeeklyCohorts(users: { createdAt: Date; lastActiveAt: Date }[]) {
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const byWeek = new Map<string, { createdAt: Date; lastActiveAt: Date }[]>();
  for (const u of users) {
    const weekStart = new Date(Math.floor(u.createdAt.getTime() / weekMs) * weekMs);
    const key = weekStart.toISOString().slice(0, 10);
    const list = byWeek.get(key) ?? [];
    list.push(u);
    byWeek.set(key, list);
  }
  const weeks = [...byWeek.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 8);
  return weeks.map(([week, cohortUsers]) => {
    const size = cohortUsers.length;
    const retained = (n: number) =>
      size === 0
        ? 0
        : cohortUsers.filter((u) => u.lastActiveAt.getTime() - u.createdAt.getTime() >= n * weekMs).length / size;
    return { week, size, week1: retained(1), week2: retained(2), week4: retained(4) };
  });
}

export type EngagementMetrics = Awaited<ReturnType<typeof getEngagementMetrics>>;
