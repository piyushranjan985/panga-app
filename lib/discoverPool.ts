import { db } from '@/lib/db';
import { type MatchableProfile } from '@/lib/matching';
import { effectiveCoords } from '@/lib/geo';
import { cacheGet, cacheSet } from '@/lib/cache';

// Shared between ordinary Discover (app/api/discover/route.ts) and Wild
// Card (app/api/discover/wildcard/route.ts) -- both rank over the exact
// same same-city pool, just with different scoring (see
// lib/matching.ts's scoreCandidate vs scoreWildCardCandidate). Pulled out
// of the discover route rather than duplicated or imported route-to-route,
// so there's exactly one query/cache to keep correct. No behavior change
// from the pre-extraction version.

// Upper bound on how many eligible profiles in one city we rank per
// request. 500 within the viewer's city (not out of a nationwide pull
// discarded down to a same-city subset afterward -- see
// CANDIDATE_POOL_CACHE_TTL_SECONDS below for why that pull is cacheable
// at all now that it's scoped this way).
const CANDIDATE_POOL_LIMIT = 500;

// Same-city eligible-candidate pool is identical for every viewer in that
// city (it doesn't depend on who's asking), so it's cached per city
// rather than re-queried from Postgres on every single request. 45s is
// short enough that a newly active user shows up almost immediately, long
// enough to absorb a burst of concurrent requests from the same city with
// one DB round trip instead of one-per-request. Falls back to querying
// the database directly if the Upstash cache isn't configured (see
// lib/cache.ts) -- this behaves identically either way, just faster once
// the cache is on.
const CANDIDATE_POOL_CACHE_TTL_SECONDS = 45;

export function toMatchable(p: {
  userId: string;
  gender: string;
  lookingFor: string[];
  city: string;
  intent: string;
  quietMode: boolean;
  interests: { id: string }[];
  user: { lastActiveAt: Date };
  latitude?: number | null;
  longitude?: number | null;
}): MatchableProfile {
  // Effective coords (real GPS if shared, else the city's centroid) --
  // same fallback distanceLabel() already uses for the display string, now
  // also feeding lib/matching.ts's eligibility/ranking for Just Vibing /
  // Something Real / Rishta Ready. See lib/geo.ts's effectiveCoords and the
  // file-level comment on lib/matching.ts's MatchableProfile.
  const coords = effectiveCoords({ latitude: p.latitude ?? null, longitude: p.longitude ?? null, city: p.city });
  return {
    userId: p.userId,
    gender: p.gender as MatchableProfile['gender'],
    lookingFor: p.lookingFor as MatchableProfile['gender'][],
    city: p.city,
    intent: p.intent as MatchableProfile['intent'],
    quietMode: p.quietMode,
    interestIds: p.interests.map((i) => i.id),
    lastActiveAt: p.user.lastActiveAt,
    latitude: coords?.lat ?? null,
    longitude: coords?.lng ?? null,
  };
}

/**
 * City-scoped candidate pool, shared across every viewer in that city.
 *
 * Deliberately returns a *lightweight* shape (select, not include) --
 * exactly what lib/matching.ts needs to rank -- because full detail
 * (photos/answers/interests for display) is only fetched afterward, for
 * just the winner(s), not the whole pool. See the discover/wildcard GET
 * handlers.
 */
export async function getCityCandidatePool(city: string): Promise<MatchableProfile[]> {
  const cacheKey = `discover:pool:v2:${city}`; // v2: added latitude/longitude (intent-aware distance matching)
  const cached = await cacheGet<MatchableProfile[]>(cacheKey);
  if (cached) {
    // Round-tripping through JSON (cacheSet/cacheGet) turns Date fields into
    // ISO strings -- scoreCandidate()/scoreWildCardCandidate() in
    // lib/matching.ts call .getTime() on lastActiveAt, so this has to be a
    // real Date again before use.
    return cached.map((c) => ({ ...c, lastActiveAt: new Date(c.lastActiveAt) }));
  }

  const rows = await db.profile.findMany({
    where: {
      city,
      quietMode: false, // isEligibleCandidate() excludes these unconditionally too -- safe to filter here
      user: { status: 'ACTIVE', discoveryRestricted: false, profileHidden: false },
    },
    select: {
      userId: true,
      gender: true,
      lookingFor: true,
      city: true,
      intent: true,
      quietMode: true,
      latitude: true,
      longitude: true,
      interests: { select: { id: true } },
      user: { select: { lastActiveAt: true } },
    },
    // Most-recently-active first, so the 500-row cap (on a city large enough
    // to hit it) favors people actually likely to respond over arbitrary DB
    // order.
    orderBy: { user: { lastActiveAt: 'desc' } },
    take: CANDIDATE_POOL_LIMIT,
  });

  const pool = rows.map(toMatchable);
  await cacheSet(cacheKey, pool, CANDIDATE_POOL_CACHE_TTL_SECONDS);
  return pool;
}
