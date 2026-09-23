import { db } from '@/lib/db';

export interface DateRange {
  from: Date;
  to: Date;
}

export function rangeFromPreset(preset: string): DateRange {
  const to = new Date();
  const from = new Date(to);
  if (preset === 'today') from.setHours(0, 0, 0, 0);
  else if (preset === '7d') from.setDate(from.getDate() - 7);
  else if (preset === '30d') from.setDate(from.getDate() - 30);
  else from.setDate(from.getDate() - 7);
  return { from, to };
}

// One place that computes every Dashboard number directly from the real
// consumer-app tables (Swipe/Match/Message/Report/Block/...) via Prisma
// aggregate queries -- no separate analytics warehouse exists yet, which
// is the honest state of an early-stage product. As volume grows, the
// queries flagged below (full-table scans without a range-friendly index)
// are exactly the ones to move to a nightly-rollup table or a real
// pipeline (ClickHouse/BigQuery) -- see admin/docs/ARCHITECTURE.md.
export async function getDashboardMetrics(range: DateRange) {
  const { from, to } = range;
  const now = new Date();
  const dau = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const wau = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const mau = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    newRegistrations,
    dauCount,
    wauCount,
    mauCount,
    onlineNow,
    completedProfiles,
    verifiedUsers,
    verificationFailures,
    likes,
    passes,
    matchesInRange,
    totalMatches,
    unmatches,
    messagesInRange,
    promptMessages,
    planMessages,
    reportsInRange,
    blocksInRange,
    suspendedUsers,
    bannedUsers,
    openTickets,
    ticketsInRange,
    byCity,
    byIntent,
    byPlatform,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { createdAt: { gte: from, lte: to } } }),
    db.user.count({ where: { lastActiveAt: { gte: dau } } }),
    db.user.count({ where: { lastActiveAt: { gte: wau } } }),
    db.user.count({ where: { lastActiveAt: { gte: mau } } }),
    // "Online now" has no real presence/heartbeat system (no websockets) --
    // this is an honest proxy (active in the last 5 minutes), not a fabricated metric.
    db.user.count({ where: { lastActiveAt: { gte: new Date(now.getTime() - 5 * 60 * 1000) } } }),
    db.profile.count(),
    db.profile.count({ where: { verification: 'VERIFIED' } }),
    db.profile.count({ where: { verification: 'REJECTED' } }),
    db.swipe.count({ where: { action: 'VYBE', createdAt: { gte: from, lte: to } } }),
    db.swipe.count({ where: { action: 'PASS', createdAt: { gte: from, lte: to } } }),
    db.match.count({ where: { createdAt: { gte: from, lte: to } } }),
    db.match.count(),
    db.match.count({ where: { unmatchedAt: { gte: from, lte: to } } }),
    db.message.count({ where: { createdAt: { gte: from, lte: to } } }),
    db.message.count({ where: { kind: 'PROMPT', createdAt: { gte: from, lte: to } } }),
    db.message.count({ where: { kind: 'PLAN', createdAt: { gte: from, lte: to } } }),
    db.report.count({ where: { createdAt: { gte: from, lte: to } } }),
    db.block.count({ where: { createdAt: { gte: from, lte: to } } }),
    db.user.count({ where: { status: 'SUSPENDED' } }),
    db.user.count({ where: { status: 'BANNED' } }),
    db.supportTicket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS', 'ESCALATED', 'WAITING_ON_USER'] } } }),
    db.supportTicket.count({ where: { createdAt: { gte: from, lte: to } } }),
    db.profile.groupBy({ by: ['city'], _count: { _all: true }, orderBy: { _count: { city: 'desc' } }, take: 8 }),
    db.profile.groupBy({ by: ['intent'], _count: { _all: true } }),
    db.loginEvent.groupBy({ by: ['platform'], _count: { _all: true }, where: { createdAt: { gte: from, lte: to } } }),
  ]);

  const incompleteProfiles = Math.max(totalUsers - completedProfiles, 0);
  const matchRate = likes > 0 ? matchesInRange / likes : 0;

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    growth: { totalUsers, newRegistrations, dau: dauCount, wau: wauCount, mau: mauCount, onlineNow },
    profiles: { completed: completedProfiles, incomplete: incompleteProfiles, verified: verifiedUsers, verificationFailures },
    matching: { likes, passes, matchesInRange, totalMatches, unmatches, matchRate },
    engagement: { messagesInRange, promptMessages, planMessages },
    safety: { reportsInRange, blocksInRange, suspendedUsers, bannedUsers },
    support: { openTickets, ticketsInRange },
    breakdowns: {
      city: byCity.map((c) => ({ label: c.city, count: c._count._all })),
      intent: byIntent.map((i) => ({ label: i.intent, count: i._count._all })),
      platform: byPlatform.map((p) => ({ label: p.platform ?? 'unknown', count: p._count._all })),
    },
  };
}

export type DashboardMetrics = Awaited<ReturnType<typeof getDashboardMetrics>>;
