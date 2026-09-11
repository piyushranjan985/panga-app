/**
 * Core discovery/compatibility logic for VybeMatch.
 *
 * Deliberately framework- and database-free: every type here is a plain
 * object, so this file has zero imports and can be unit-tested with nothing
 * but a TypeScript runtime (see scripts/verify-matching.ts). The API route
 * at app/api/discover/route.ts maps Prisma rows onto these shapes and calls
 * straight into here — the query layer should never contain scoring logic.
 */

export type IntentType = 'JUST_VIBING' | 'SOMETHING_REAL' | 'RISHTA_READY';
export type Gender = 'WOMAN' | 'MAN' | 'NON_BINARY' | 'OTHER';

export interface MatchableProfile {
  userId: string;
  gender: Gender;
  lookingFor: Gender[];
  city: string;
  intent: IntentType;
  quietMode: boolean;
  circleIds: string[];
  interestIds: string[];
  lastActiveAt: Date;
}

/**
 * Intent compatibility matrix. 1.0 = perfectly aligned, 0 = don't surface
 * at all. This is the single biggest lever VybeMatch has over Tinder-style
 * apps (no intent signal at all) and matrimony sites (only one intent):
 * mismatched intent is filtered, not just down-ranked, once the gap is
 * this wide (Just Vibing vs Rishta Ready).
 */
const INTENT_COMPATIBILITY: Record<IntentType, Record<IntentType, number>> = {
  JUST_VIBING: { JUST_VIBING: 1, SOMETHING_REAL: 0.6, RISHTA_READY: 0 },
  SOMETHING_REAL: { JUST_VIBING: 0.6, SOMETHING_REAL: 1, RISHTA_READY: 0.5 },
  RISHTA_READY: { JUST_VIBING: 0, SOMETHING_REAL: 0.5, RISHTA_READY: 1 },
};

export const INTENT_LABELS: Record<IntentType, string> = {
  JUST_VIBING: 'Just Vibing',
  SOMETHING_REAL: 'Something Real',
  RISHTA_READY: 'Rishta Ready',
};

const WEIGHTS = {
  sharedCircle: 18, // per shared circle, community context matters most
  sharedInterest: 7, // per shared interest
  sameCity: 12,
  intent: 40, // scaled by the 0..1 compatibility factor above
  recency: 8, // active in the last 48h
};

function mutualGenderMatch(a: MatchableProfile, b: MatchableProfile): boolean {
  return a.lookingFor.includes(b.gender) && b.lookingFor.includes(a.gender);
}

function sharedCount(a: string[], b: string[]): number {
  const setB = new Set(b);
  return a.filter((x) => setB.has(x)).length;
}

/**
 * Hard filters: a candidate that fails any of these should never appear in
 * the feed, regardless of score. Kept separate from scoring so the two
 * concerns (can they even see each other / how good is the match) don't get
 * tangled.
 */
export function isEligibleCandidate(viewer: MatchableProfile, candidate: MatchableProfile): boolean {
  if (viewer.userId === candidate.userId) return false;
  if (candidate.quietMode) return false;
  if (!mutualGenderMatch(viewer, candidate)) return false;

  const compatibility = INTENT_COMPATIBILITY[viewer.intent][candidate.intent];
  if (compatibility <= 0) return false;

  const sameCity = viewer.city === candidate.city;
  const sharedCircles = sharedCount(viewer.circleIds, candidate.circleIds);
  // Must share a city OR a circle — otherwise there's no real path to meet.
  if (!sameCity && sharedCircles === 0) return false;

  return true;
}

export interface ScoredCandidate {
  userId: string;
  score: number;
  reasons: string[];
}

export function scoreCandidate(viewer: MatchableProfile, candidate: MatchableProfile, now: Date = new Date()): ScoredCandidate {
  const reasons: string[] = [];
  let score = 0;

  const sharedCircles = sharedCount(viewer.circleIds, candidate.circleIds);
  if (sharedCircles > 0) {
    score += sharedCircles * WEIGHTS.sharedCircle;
    reasons.push(`${sharedCircles} shared circle${sharedCircles > 1 ? 's' : ''}`);
  }

  const sharedInterests = sharedCount(viewer.interestIds, candidate.interestIds);
  if (sharedInterests > 0) {
    score += sharedInterests * WEIGHTS.sharedInterest;
    reasons.push(`${sharedInterests} shared interest${sharedInterests > 1 ? 's' : ''}`);
  }

  if (viewer.city === candidate.city) {
    score += WEIGHTS.sameCity;
    reasons.push('same city');
  }

  const compatibility = INTENT_COMPATIBILITY[viewer.intent][candidate.intent];
  score += compatibility * WEIGHTS.intent;
  if (compatibility === 1) reasons.push('same intent');

  const hoursSinceActive = (now.getTime() - candidate.lastActiveAt.getTime()) / 36e5;
  if (hoursSinceActive <= 48) {
    score += WEIGHTS.recency * (1 - hoursSinceActive / 48);
  }

  return { userId: candidate.userId, score: Math.round(score * 100) / 100, reasons };
}

/**
 * Returns eligible candidates ranked best-first. This is what the discovery
 * feed API calls; excludedUserIds should already contain anyone the viewer
 * has swiped on.
 */
export function rankCandidates(
  viewer: MatchableProfile,
  candidates: MatchableProfile[],
  excludedUserIds: Set<string> = new Set(),
  now: Date = new Date(),
): ScoredCandidate[] {
  return candidates
    .filter((c) => !excludedUserIds.has(c.userId))
    .filter((c) => isEligibleCandidate(viewer, c))
    .map((c) => scoreCandidate(viewer, c, now))
    .sort((a, b) => b.score - a.score);
}
