import { db } from '@/lib/db';
import { startOfTodayIST } from '@/lib/istTime';

// Wild Card -- see docs/WILD_CARD.md. Kept as its own lib file (not
// inlined in the route handler) for the same reason lib/vybeVouch.ts is:
// the daily limit and the quota math are policy, used by two different
// routes (the main discover feed, which just needs the count for its
// button; the wildcard route itself, which enforces it) that would
// otherwise have to agree on the exact same WildCardUse query by hand.

// 2/day, resetting at IST midnight (same day boundary Mystery Match's
// cron uses -- see lib/istTime.ts) -- deliberately small: Wild Card is a
// "see what happens" detour from ordinary Discover, not a second feed.
export const WILD_CARD_DAILY_LIMIT = 2;

export interface WildCardQuota {
  limit: number;
  used: number;
  remaining: number;
}

/**
 * Today's Wild Card usage for one viewer, IST-day-scoped. A "use" is
 * counted the moment a card is actually handed back (see
 * app/api/discover/wildcard/route.ts) -- an empty-pool miss costs nothing,
 * same spirit as ordinary Discover never penalizing someone for a thin
 * pool.
 */
export async function wildCardQuota(userId: string, now: Date = new Date()): Promise<WildCardQuota> {
  const used = await db.wildCardUse.count({
    where: { userId, createdAt: { gte: startOfTodayIST(now) } },
  });
  return { limit: WILD_CARD_DAILY_LIMIT, used, remaining: Math.max(0, WILD_CARD_DAILY_LIMIT - used) };
}

/**
 * Today's already-served Wild Card candidates for one viewer -- excluded
 * from today's pool so two pulls in the same day can't hand back the same
 * unswiped person (ordinary Discover's "already swiped" exclusion doesn't
 * cover a card that was shown but never acted on).
 */
export async function todaysWildCardCandidateIds(userId: string, now: Date = new Date()): Promise<string[]> {
  const rows = await db.wildCardUse.findMany({
    where: { userId, createdAt: { gte: startOfTodayIST(now) } },
    select: { candidateUserId: true },
  });
  return rows.map((r) => r.candidateUserId);
}
