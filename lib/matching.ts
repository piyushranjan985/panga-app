/**
 * Core discovery/compatibility logic for findmyVybe.
 *
 * Deliberately framework- and database-free: every type here is a plain
 * object, so this file has zero *framework/DB* imports and can be
 * unit-tested with nothing but a TypeScript runtime (see
 * scripts/verify-matching.ts). The API route at app/api/discover/route.ts
 * maps Prisma rows onto these shapes and calls straight into here — the
 * query layer should never contain scoring logic.
 *
 * latitude/longitude on MatchableProfile are EFFECTIVE coordinates —
 * either a profile's real opted-in GPS point, or its city's centroid as a
 * fallback (see lib/geo.ts's effectiveCoords, which the discover route
 * calls before building these objects) — so distance below is always
 * computable for any profile with a recognized city, not just the minority
 * who've granted precise location. This file keeps its own tiny haversine
 * helper rather than importing lib/geo.ts's, purely to stay self-contained
 * per the paragraph above; the two are intentionally the same formula.
 *
 * ageMin/ageMax (product decision, 2026-10-17) are the VIEWER's own
 * preferred age range (see prisma/schema.prisma's Profile.ageMin/ageMax
 * doc comment) and feed scoreCandidate's ageFitFactor below -- a SOFT
 * signal, deliberately not part of isEligibleCandidate: being outside
 * someone's preferred range down-ranks a candidate, it never removes them
 * from the feed outright, unlike the mutual gender check or the intent-
 * compatibility floor. Only the viewer's own range is ever consulted when
 * scoring a candidate -- this isn't mutual the way gender is; a 50-year-
 * old who narrows their own range to 45-55 still appears normally in a
 * 25-year-old's feed, exactly as a wide search radius for one person
 * doesn't shrink anyone else's. dateOfBirth is required (every real
 * Profile row has one -- see lib/age.ts) and is used only for this
 * scoring factor; nothing here duplicates lib/age.ts's age math.
 */

import { ageFromDateOfBirth } from '@/lib/age';

export type IntentType = 'JUST_VIBING' | 'SOMETHING_REAL' | 'RISHTA_READY';
export type Gender = 'WOMAN' | 'MAN' | 'NON_BINARY' | 'OTHER';

export interface MatchableProfile {
  userId: string;
  gender: Gender;
  lookingFor: Gender[];
  city: string;
  intent: IntentType;
  quietMode: boolean;
  interestIds: string[];
  lastActiveAt: Date;
  // Effective (GPS-or-city-centroid-fallback) coordinates -- see the
  // file-level comment above. Optional/nullable because a handful of call
  // sites (tests, anywhere a city can't be resolved to a centroid) may not
  // have them; every distance check below is null-safe.
  latitude?: number | null;
  longitude?: number | null;
  // See the file-level comment above -- dateOfBirth is THIS profile's own
  // birth date (used to compute ITS age when it's the candidate being
  // scored); ageMin/ageMax are THIS profile's own preferred range (used
  // when it's the viewer doing the scoring). Every real profile has all
  // three (schema defaults ageMin/ageMax to 18/99), so these are required,
  // not optional like lat/lng.
  dateOfBirth: Date;
  ageMin: number;
  ageMax: number;
}

/**
 * Intent compatibility matrix. 1.0 = perfectly aligned, 0 = don't surface
 * at all. This is the single biggest lever findmyVybe has over Tinder-style
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

/**
 * Every candidate intent with compatibility > 0 for a given viewer intent
 * (i.e. everything isEligibleCandidate's compatibility check wouldn't
 * reject outright), derived from INTENT_COMPATIBILITY so there's exactly
 * one source of truth. Used by lib/discoverPool.ts / the search route to
 * push this half of eligibility into the SQL WHERE clause -- the SQL
 * filter is a performance/pool-composition optimization only; the actual
 * eligibility decision shown to users still comes from isEligibleCandidate
 * below, unchanged, run again over whatever SQL returns.
 */
export function compatibleIntents(viewerIntent: IntentType): IntentType[] {
  const row = INTENT_COMPATIBILITY[viewerIntent];
  return (Object.keys(row) as IntentType[]).filter((candidateIntent) => row[candidateIntent] > 0);
}

const WEIGHTS = {
  sharedInterest: 7, // per shared interest
  sameCity: 12,
  intent: 40, // scaled by the 0..1 compatibility factor above
  recency: 8, // active in the last 48h
  proximityPrimary: 30, // Just Vibing: distance is THE location signal -- see DISTANCE_RADIUS_KM
  proximitySecondary: 10, // Something Real / Rishta Ready: a same-city tiebreaker, not a requirement
  age: 15, // within the viewer's preferred range -- see ageFitFactor and MatchableProfile's doc comment
};

// Years outside the viewer's [ageMin, ageMax] before the age bonus fully
// disappears -- same linear-taper shape as proximityFactor below, just for
// age instead of distance. Arbitrary but reasonable: one year outside a
// chosen range shouldn't feel like a cliff edge, ten years outside it
// should contribute nothing.
const AGE_TAPER_YEARS = 10;

/**
 * Per-intent location rules (see isEligibleCandidate and scoreCandidate).
 *
 * - JUST_VIBING: distance-only -- "closer the better" for a casual,
 *   possibly-same-day hangout, so a same-city match on the far side of a
 *   sprawling metro (Bengaluru, Delhi NCR) shouldn't count as "nearby"
 *   just because the city string matches.
 * - SOMETHING_REAL / RISHTA_READY: same city remains sufficient on its own
 *   (unchanged from before this file supported distance at all), OR within
 *   this radius for someone just outside the city label/boundary --
 *   distance is additionally used as a smaller ranking tiebreaker within
 *   an eligible pool (WEIGHTS.proximitySecondary), not a requirement.
 *
 * Tune these independently -- nothing else depends on them being equal.
 */
export const DISTANCE_RADIUS_KM: Record<IntentType, number> = {
  JUST_VIBING: 25,
  SOMETHING_REAL: 50,
  RISHTA_READY: 50,
};

const EARTH_RADIUS_KM = 6371;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Same haversine formula as lib/geo.ts -- see the file-level comment on why it's duplicated here. */
function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);
  const lat1 = toRadians(aLat);
  const lat2 = toRadians(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Null when either side lacks resolvable coordinates (should be rare -- see MatchableProfile). */
function distanceKmBetween(a: MatchableProfile, b: MatchableProfile): number | null {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return null;
  return haversineKm(a.latitude, a.longitude, b.latitude, b.longitude);
}

/** 1 at zero distance, falling linearly to 0 at radiusKm and beyond; null distance scores 0. */
function proximityFactor(distanceKm: number | null, radiusKm: number): number {
  if (distanceKm === null) return 0;
  return Math.max(0, 1 - distanceKm / radiusKm);
}

/**
 * 1 when candidateAge falls inside [ageMin, ageMax], tapering linearly to
 * 0 at AGE_TAPER_YEARS past whichever bound it missed -- see WEIGHTS.age's
 * comment. Only ever evaluated against the VIEWER's own range (this is a
 * one-sided preference, not mutual like gender -- see the file-level
 * comment), so this takes the bounds directly rather than a MatchableProfile.
 */
function ageFitFactor(candidateAge: number, ageMin: number, ageMax: number): number {
  if (candidateAge >= ageMin && candidateAge <= ageMax) return 1;
  const over = candidateAge < ageMin ? ageMin - candidateAge : candidateAge - ageMax;
  return Math.max(0, 1 - over / AGE_TAPER_YEARS);
}

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

  return hasLocationPath(viewer, candidate);
}

/**
 * The location leg of eligibility -- split out of isEligibleCandidate
 * because the rule itself depends on the VIEWER's intent (which Discover
 * tab/mode they're browsing in), not a single fixed rule for everyone. See
 * DISTANCE_RADIUS_KM's doc comment for why each intent works the way it
 * does.
 *
 * Note: this function itself has no notion of "the candidate pool only
 * came from one city" -- that's a performance choice made one layer up, in
 * app/api/discover/route.ts's getCityCandidatePool (reusing the per-city
 * cache from the earlier discover-feed scale fix, since findmyVybe's
 * supported cities are each hundreds of km apart, so a cross-city match
 * within these radii essentially never arises with the current city list).
 * isEligibleCandidate stays correct and general regardless of what pool
 * it's handed.
 */
function hasLocationPath(viewer: MatchableProfile, candidate: MatchableProfile): boolean {
  const sameCity = viewer.city === candidate.city;
  const distance = distanceKmBetween(viewer, candidate);

  if (viewer.intent === 'JUST_VIBING') {
    return distance !== null && distance <= DISTANCE_RADIUS_KM.JUST_VIBING;
  }

  const radius = DISTANCE_RADIUS_KM[viewer.intent];
  return sameCity || (distance !== null && distance <= radius);
}

export interface ScoredCandidate {
  userId: string;
  score: number;
  reasons: string[];
}

export function scoreCandidate(viewer: MatchableProfile, candidate: MatchableProfile, now: Date = new Date()): ScoredCandidate {
  const reasons: string[] = [];
  let score = 0;

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

  // Just Vibing: distance is the primary location signal, weighted heavily
  // so closer candidates visibly outrank farther ones within the radius
  // (see DISTANCE_RADIUS_KM). Something Real / Rishta Ready: a lighter
  // tiebreaker on top of the sameCity bonus above, not a requirement.
  const distance = distanceKmBetween(viewer, candidate);
  const radius = DISTANCE_RADIUS_KM[viewer.intent];
  const proximity = proximityFactor(distance, radius);
  if (proximity > 0) {
    const weight = viewer.intent === 'JUST_VIBING' ? WEIGHTS.proximityPrimary : WEIGHTS.proximitySecondary;
    score += proximity * weight;
    if (distance !== null && distance <= 2) reasons.push('right nearby');
    else reasons.push('close by');
  }

  // Age: a soft, one-sided signal (see the file-level comment and
  // ageFitFactor) -- only pushes a reason when the viewer has actually
  // narrowed their default wide-open 18-99 range, so the vast majority of
  // candidates (everyone still on the default) never get a reason that'd
  // be true of virtually every profile in the pool.
  const ageFit = ageFitFactor(ageFromDateOfBirth(candidate.dateOfBirth, now), viewer.ageMin, viewer.ageMax);
  if (ageFit > 0) {
    score += ageFit * WEIGHTS.age;
    const viewerNarrowedRange = viewer.ageMin > 18 || viewer.ageMax < 99;
    if (ageFit === 1 && viewerNarrowedRange) reasons.push('in your preferred age range');
  }

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

/**
 * Wild Card (see docs/WILD_CARD.md) -- same intent, same-city compatibility
 * floor as ordinary discovery (isEligibleCandidate is reused UNCHANGED, not
 * duplicated or loosened), with exactly one scoring term flipped: shared
 * interests. scoreCandidate() rewards overlap; this rewards its absence,
 * weighted twice as heavily so it's the dominant signal rather than a
 * tiebreaker -- "opposites attract," not "everyone you'd never otherwise
 * see." City/intent/proximity/recency terms are identical to scoreCandidate
 * on purpose: Wild Card is still someone you could actually go meet, in
 * your city, wanting the same kind of thing you are -- just a stranger on
 * paper instead of a lookalike.
 */
export function scoreWildCardCandidate(viewer: MatchableProfile, candidate: MatchableProfile, now: Date = new Date()): ScoredCandidate {
  const reasons: string[] = [];
  let score = 0;

  const sharedInterests = sharedCount(viewer.interestIds, candidate.interestIds);
  score -= sharedInterests * WEIGHTS.sharedInterest * 2;
  reasons.push(sharedInterests === 0 ? 'nothing in common on paper' : `only ${sharedInterests} shared interest${sharedInterests > 1 ? 's' : ''}`);

  if (viewer.city === candidate.city) {
    score += WEIGHTS.sameCity;
    reasons.push('same city');
  }

  const compatibility = INTENT_COMPATIBILITY[viewer.intent][candidate.intent];
  score += compatibility * WEIGHTS.intent;
  if (compatibility === 1) reasons.push('same intent');

  // Same proximity treatment as scoreCandidate -- Wild Card still respects
  // intent's location rule (isEligibleCandidate's hasLocationPath), this
  // is just the within-the-eligible-pool tiebreaker.
  const distance = distanceKmBetween(viewer, candidate);
  const radius = DISTANCE_RADIUS_KM[viewer.intent];
  const proximity = proximityFactor(distance, radius);
  if (proximity > 0) {
    const weight = viewer.intent === 'JUST_VIBING' ? WEIGHTS.proximityPrimary : WEIGHTS.proximitySecondary;
    score += proximity * weight;
    if (distance !== null && distance <= 2) reasons.push('right nearby');
    else reasons.push('close by');
  }

  // Age: a soft, one-sided signal (see the file-level comment and
  // ageFitFactor) -- only pushes a reason when the viewer has actually
  // narrowed their default wide-open 18-99 range, so the vast majority of
  // candidates (everyone still on the default) never get a reason that'd
  // be true of virtually every profile in the pool.
  const ageFit = ageFitFactor(ageFromDateOfBirth(candidate.dateOfBirth, now), viewer.ageMin, viewer.ageMax);
  if (ageFit > 0) {
    score += ageFit * WEIGHTS.age;
    const viewerNarrowedRange = viewer.ageMin > 18 || viewer.ageMax < 99;
    if (ageFit === 1 && viewerNarrowedRange) reasons.push('in your preferred age range');
  }

  const hoursSinceActive = (now.getTime() - candidate.lastActiveAt.getTime()) / 36e5;
  if (hoursSinceActive <= 48) {
    score += WEIGHTS.recency * (1 - hoursSinceActive / 48);
  }

  return { userId: candidate.userId, score: Math.round(score * 100) / 100, reasons };
}

/**
 * Wild Card's ranking entry point -- same shape as rankCandidates, scored
 * with scoreWildCardCandidate instead. excludedUserIds should contain
 * anyone the viewer has swiped on, blocked in either direction, AND
 * anyone already served to them as a Wild Card today (see
 * app/api/discover/wildcard/route.ts) -- the last one isn't this
 * function's concern, same way "already swiped" isn't rankCandidates'.
 */
export function rankWildCardCandidates(
  viewer: MatchableProfile,
  candidates: MatchableProfile[],
  excludedUserIds: Set<string> = new Set(),
  now: Date = new Date(),
): ScoredCandidate[] {
  return candidates
    .filter((c) => !excludedUserIds.has(c.userId))
    .filter((c) => isEligibleCandidate(viewer, c))
    .map((c) => scoreWildCardCandidate(viewer, c, now))
    .sort((a, b) => b.score - a.score);
}
