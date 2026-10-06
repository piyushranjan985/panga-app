import { db } from '@/lib/db';

/**
 * "Learns your taste" signal for Discover's search results (item 5 of the
 * Sept 2026 feature request) -- plain frequency statistics over the
 * viewer's own past right-swipes (Swipe.action === 'VYBE'), NOT a live
 * agent and NOT an LLM call. Per the user's explicit scoping answer
 * ("Keep it free/rule-based"), this stays consistent with the rest of the
 * app's $0-paid-API stance (self-hosted photo moderation, free-tier
 * email/SMS/push -- see lib/matching.ts's and admin/lib/push.ts's
 * comments for the same pattern).
 *
 * Computed fresh per search request rather than precomputed/stored: the
 * per-city candidate pools here are small (<=500, see
 * lib/discoverPool.ts's CANDIDATE_POOL_LIMIT) and this only runs on an
 * explicit search action, not on every ordinary Discover feed load, so
 * there's no new schema, cron, or background job needed for it.
 */

export interface BehaviorWeights {
  interestWeight: Map<string, number>;
  tribeWeight: Map<string, number>;
  likedCount: number;
}

const RECENT_LIKES_SAMPLE = 200; // a bias signal, not a ledger -- recent taste matters more than ancient history

export async function buildBehaviorWeights(viewerUserId: string): Promise<BehaviorWeights> {
  const liked = await db.swipe.findMany({
    where: { fromUserId: viewerUserId, action: 'VYBE' },
    select: { toUserId: true },
    orderBy: { createdAt: 'desc' },
    take: RECENT_LIKES_SAMPLE,
  });

  const interestWeight = new Map<string, number>();
  const tribeWeight = new Map<string, number>();
  if (liked.length === 0) return { interestWeight, tribeWeight, likedCount: 0 };

  const likedProfiles = await db.profile.findMany({
    where: { userId: { in: liked.map((l) => l.toUserId) } },
    select: { interests: { select: { id: true } }, tribes: { select: { id: true } } },
  });

  for (const p of likedProfiles) {
    for (const i of p.interests) interestWeight.set(i.id, (interestWeight.get(i.id) ?? 0) + 1);
    for (const t of p.tribes) tribeWeight.set(t.id, (tribeWeight.get(t.id) ?? 0) + 1);
  }

  return { interestWeight, tribeWeight, likedCount: liked.length };
}

// Small relative to lib/matching.ts's WEIGHTS (e.g. sharedInterest) -- this
// is meant to bias search ranking toward a viewer's demonstrated taste, not
// override the core same-city/intent/proximity signals that already decide
// eligibility and the bulk of the score.
const MAX_BEHAVIOR_BOOST = 3;

/** Returns 0 when the viewer hasn't liked anyone yet (brand-new account) -- no signal to act on. */
export function behaviorBoost(candidateInterestIds: string[], candidateTribeIds: string[], weights: BehaviorWeights): number {
  if (weights.likedCount === 0) return 0;
  let raw = 0;
  for (const id of candidateInterestIds) raw += weights.interestWeight.get(id) ?? 0;
  for (const id of candidateTribeIds) raw += weights.tribeWeight.get(id) ?? 0;
  // Normalized by how many profiles the viewer has liked, so a heavy
  // swiper and a brand-new account get comparably-scaled bumps rather
  // than the raw count favoring whoever has swiped more.
  const normalized = raw / weights.likedCount;
  return Math.min(MAX_BEHAVIOR_BOOST, normalized * MAX_BEHAVIOR_BOOST);
}
