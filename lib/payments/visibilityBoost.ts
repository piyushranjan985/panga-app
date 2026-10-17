// lib/payments/visibilityBoost.ts
//
// Two different ways a profile gets ranked higher in OTHER people's
// Discover feed -- kept in one file because app/api/discover/route.ts
// needs to apply both as the exact same kind of thing (a score bonus
// added on top of lib/matching.ts's ordinary ranking, never a change to
// who's eligible):
//
//   1. `priority_placement` -- a subscription FeatureKey, active for as
//      long as the viewer-of-this-row's Subscription is ACTIVE and their
//      plan grants it (see lib/payments/entitlements.ts).
//   2. `profile_boost` / `profile_spotlight` -- one-off CreditFeatureKeys
//      (see lib/payments/types.ts), active for a fixed window after the
//      most recent spend. There's no schema field for "boost active
//      until <time>" -- the CreditLedgerEntry each spend already writes
//      (see spendCredits() in lib/payments/entitlements.ts) IS the record
//      of when it was spent, so "still active" is just "spent recently
//      enough", computed on read rather than stored.
//
// lib/matching.ts stays completely free of either concept on purpose
// (same reason its own file comment gives for keeping age/distance
// scoring pure and DB-free) -- these bonuses are applied by the route,
// after rankCandidates() has already produced its ordinary, un-boosted
// order, and only among the candidates present in that one request's
// pool (bounded by ELIGIBLE_POOL_LIMIT, same bound app/api/discover/
// route.ts already applies to its other per-pool-member queries like
// "already swiped").

import { db } from '@/lib/db';
import { isFreeTier } from './flags';

export const PRIORITY_PLACEMENT_SCORE_BONUS = 20;

export const PROFILE_BOOST_SCORE_BONUS = 25;
export const PROFILE_BOOST_DURATION_MINUTES = 30;

export const PROFILE_SPOTLIGHT_SCORE_BONUS = 60;
export const PROFILE_SPOTLIGHT_DURATION_MINUTES = 240;

const BOOST_REASON = 'feature_redeem:profile_boost';
const SPOTLIGHT_REASON = 'feature_redeem:profile_spotlight';

/**
 * Which of the given candidate userIds currently hold an ACTIVE
 * subscription whose plan grants `priority_placement`. Bounded to the
 * ids the caller passes in (never scans every Subscription row) -- see
 * the file comment above for why that bound is fine here, same as it is
 * for the other per-pool queries app/api/discover/route.ts already runs.
 */
export async function getPriorityPlacementUserIds(userIds: string[]): Promise<Set<string>> {
  if (isFreeTier() || userIds.length === 0) return new Set();

  const subs = await db.subscription.findMany({
    where: { userId: { in: userIds }, status: 'ACTIVE', currentPeriodEnd: { gt: new Date() } },
    select: { userId: true, plan: { select: { features: true } } },
  });

  const ids = new Set<string>();
  for (const s of subs) {
    const features = (s.plan.features ?? {}) as Partial<Record<string, boolean>>;
    if (features.priority_placement) ids.add(s.userId);
  }
  return ids;
}

/**
 * Score bonus (0 if none active) for every userId in `userIds` currently
 * within a profile_boost/profile_spotlight window, keyed by userId.
 * "Active" = the most recent profile_boost-or-profile_spotlight
 * CreditLedgerEntry for that user is still within its own duration --
 * whichever of the two was spent most recently governs (buying Spotlight
 * after an active Boost extends/upgrades it; an expired one simply
 * stops counting), never both stacked at once.
 */
export async function getActiveVisibilityBoostBonus(userIds: string[]): Promise<Map<string, number>> {
  const bonusByUserId = new Map<string, number>();
  if (isFreeTier() || userIds.length === 0) return bonusByUserId;

  const entries = await db.creditLedgerEntry.findMany({
    where: { userId: { in: userIds }, reason: { in: [BOOST_REASON, SPOTLIGHT_REASON] } },
    orderBy: { createdAt: 'desc' },
    select: { userId: true, reason: true, createdAt: true },
  });

  const now = Date.now();
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.userId)) continue; // only the most recent spend per user matters
    seen.add(entry.userId);

    const isSpotlight = entry.reason === SPOTLIGHT_REASON;
    const durationMs = (isSpotlight ? PROFILE_SPOTLIGHT_DURATION_MINUTES : PROFILE_BOOST_DURATION_MINUTES) * 60 * 1000;
    if (now - entry.createdAt.getTime() <= durationMs) {
      bonusByUserId.set(entry.userId, isSpotlight ? PROFILE_SPOTLIGHT_SCORE_BONUS : PROFILE_BOOST_SCORE_BONUS);
    }
  }
  return bonusByUserId;
}

export interface ActiveBoostStatus {
  kind: 'profile_boost' | 'profile_spotlight';
  activeUntil: string;
}

/** The CALLER's own current boost status (for the Discover page's own "Boost active until…" chip), or null if none. */
export async function getOwnActiveBoostStatus(userId: string): Promise<ActiveBoostStatus | null> {
  if (isFreeTier()) return null;

  const entry = await db.creditLedgerEntry.findFirst({
    where: { userId, reason: { in: [BOOST_REASON, SPOTLIGHT_REASON] } },
    orderBy: { createdAt: 'desc' },
    select: { reason: true, createdAt: true },
  });
  if (!entry) return null;

  const isSpotlight = entry.reason === SPOTLIGHT_REASON;
  const durationMinutes = isSpotlight ? PROFILE_SPOTLIGHT_DURATION_MINUTES : PROFILE_BOOST_DURATION_MINUTES;
  const activeUntil = new Date(entry.createdAt.getTime() + durationMinutes * 60 * 1000);
  if (activeUntil.getTime() <= Date.now()) return null;

  return { kind: isSpotlight ? 'profile_spotlight' : 'profile_boost', activeUntil: activeUntil.toISOString() };
}
