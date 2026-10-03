/**
 * Mystery Match's daily batch-pairing engine -- see docs/MYSTERY_MATCH.md.
 *
 * Deliberately framework- and database-free, same discipline as
 * lib/matching.ts and lib/vibeMatch.ts: plain objects in, plain objects
 * out, so this is unit-testable with nothing but a TypeScript runtime (see
 * scripts/verify-mystery-match.ts) and the cron route
 * (app/api/cron/mystery-match/route.ts) owns every Prisma/DB concern.
 *
 * This is NOT lib/matching.ts's discovery ranking -- it answers a
 * different question ("who should the WHOLE day's opted-in pool be split
 * into pairs with, once, for this one category") rather than "rank this
 * one viewer's candidates." That's why it's a one-shot greedy pairing over
 * a pool, not a per-viewer score.
 */

export type Gender = 'WOMAN' | 'MAN' | 'NON_BINARY' | 'OTHER';
export type IntentType = 'JUST_VIBING' | 'SOMETHING_REAL' | 'RISHTA_READY';
export type MysteryCategory = 'MYSTERY_MATCH' | 'VYBE_FLIP' | 'NO_LABELS';

export interface MysteryCandidate {
  userId: string;
  gender: Gender;
  lookingFor: Gender[];
  city: string;
  intent: IntentType;
  interestIds: string[];
  tribeIds: string[];
  lastActiveAt: Date;
}

export interface MysteryPair {
  userIdA: string;
  userIdB: string;
}

function mutualGenderMatch(a: MysteryCandidate, b: MysteryCandidate): boolean {
  return a.lookingFor.includes(b.gender) && b.lookingFor.includes(a.gender);
}

function sharedCount(a: string[], b: string[]): number {
  const setB = new Set(b);
  return a.filter((x) => setB.has(x)).length;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/**
 * Whether two candidates are even allowed to be considered for this
 * category -- separate from scoring, same split lib/matching.ts uses
 * between isEligibleCandidate and scoreCandidate.
 *
 * - MYSTERY_MATCH: same intent, same city. The "plain" option -- no
 *   deliberate twist, just someone new.
 * - VYBE_FLIP: same intent, same city -- the twist is entirely in the
 *   scoring (lowest overlap wins), not the eligibility gate.
 * - NO_LABELS: DIFFERENT intent (that's the entire point), same city.
 *   All 3 intents are in scope, Rishta Ready included -- safe to allow
 *   because nobody lands in this pool without actively choosing it that
 *   day (see docs/MYSTERY_MATCH.md's consent note).
 *
 * Same-city only (not lib/matching.ts's distance-radius fallback) on
 * purpose: this is meant to lead to an actual in-person meetup, so a
 * same-city floor matches how Something Real/Rishta Ready discovery
 * already treats location, without Just Vibing's tighter distance math
 * (which doesn't obviously apply to a blind pairing nobody GPS-shared
 * context for yet).
 */
function isEligiblePair(category: MysteryCategory, a: MysteryCandidate, b: MysteryCandidate): boolean {
  if (a.userId === b.userId) return false;
  if (a.city !== b.city) return false;
  if (!mutualGenderMatch(a, b)) return false;

  if (category === 'NO_LABELS') return a.intent !== b.intent;
  return a.intent === b.intent;
}

/**
 * Pair score -- higher wins. Only meaningfully differs by category for
 * VYBE_FLIP (which inverts lib/vibeMatch.ts's whole premise: LOW overlap
 * is the point, not high). A small lastActiveAt-recency nudge is added
 * everywhere so two people who are actually likely to respond today are
 * mildly preferred over two equally-eligible people, one of whom hasn't
 * opened the app in weeks.
 */
function scorePair(category: MysteryCategory, a: MysteryCandidate, b: MysteryCandidate, now: Date): number {
  const recencyA = Math.max(0, 48 - (now.getTime() - a.lastActiveAt.getTime()) / 3_600_000);
  const recencyB = Math.max(0, 48 - (now.getTime() - b.lastActiveAt.getTime()) / 3_600_000);
  const recency = (recencyA + recencyB) / 2; // 0..48

  if (category === 'VYBE_FLIP') {
    const overlap = sharedCount(a.interestIds, b.interestIds) + sharedCount(a.tribeIds, b.tribeIds);
    // Flip the normal reward: fewer shared interests/tribes scores
    // HIGHER. -overlap dominates the small recency nudge on purpose.
    return -overlap * 10 + recency;
  }

  // MYSTERY_MATCH and NO_LABELS: no overlap preference either way --
  // intentionally close to random, just recency-nudged, since "vibe
  // similarity" isn't this category's twist.
  return recency;
}

/**
 * One-shot greedy pairing over a single category's opted-in pool for one
 * day. `excludePairs` is every pair that must never be re-suggested
 * (prior Mystery Match history in ANY category, existing/past Match,
 * Swipe in either direction, Block in either direction -- all assembled
 * by the caller, see app/api/cron/mystery-match/route.ts) -- keyed by
 * pairKey() so direction doesn't matter.
 *
 * Greedy-highest-score-first, not a true stable-matching solve: this is
 * a once-a-day job over what's expected to stay a modest pool size for a
 * while (one city, opt-in, split across 3 categories), and a perfect
 * assignment isn't the point of something framed as a mystery anyway --
 * see lib/vibeMatch.ts's file comment for the same "good enough, not
 * scientific" stance this codebase already takes for a fun-not-ranking
 * computation.
 */
export function matchMysteryPool(
  category: MysteryCategory,
  pool: MysteryCandidate[],
  excludePairs: ReadonlySet<string>,
  now: Date = new Date(),
): MysteryPair[] {
  const scored: { a: MysteryCandidate; b: MysteryCandidate; score: number }[] = [];
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i]!;
      const b = pool[j]!;
      if (excludePairs.has(pairKey(a.userId, b.userId))) continue;
      if (!isEligiblePair(category, a, b)) continue;
      scored.push({ a, b, score: scorePair(category, a, b, now) });
    }
  }
  scored.sort((x, y) => y.score - x.score);

  const taken = new Set<string>();
  const result: MysteryPair[] = [];
  for (const { a, b } of scored) {
    if (taken.has(a.userId) || taken.has(b.userId)) continue;
    taken.add(a.userId);
    taken.add(b.userId);
    result.push({ userIdA: a.userId, userIdB: b.userId });
  }
  return result;
}

/** Cycle order for the 7-day-inactivity auto-rotation -- never lands on OPTED_OUT. */
const ROTATION_ORDER: MysteryCategory[] = ['MYSTERY_MATCH', 'VYBE_FLIP', 'NO_LABELS'];

export function nextRotationCategory(current: MysteryCategory): MysteryCategory {
  const idx = ROTATION_ORDER.indexOf(current);
  return ROTATION_ORDER[(idx + 1) % ROTATION_ORDER.length]!;
}
