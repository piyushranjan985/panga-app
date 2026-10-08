import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { type MatchableProfile, type Gender, type IntentType, DISTANCE_RADIUS_KM, compatibleIntents } from '@/lib/matching';
import { effectiveCoords, CITY_CENTROIDS, gridCellFor, GRID_CELL_RADIUS_PADDING_KM } from '@/lib/geo';
import { cacheGet, cacheSet } from '@/lib/cache';

// Shared between ordinary Discover (app/api/discover/route.ts) and Wild
// Card (app/api/discover/wildcard/route.ts) -- both rank over the exact
// same eligible-candidate pool, just with different scoring (see
// lib/matching.ts's scoreCandidate vs scoreWildCardCandidate). Pulled out
// of the discover route rather than duplicated or imported route-to-route,
// so there's exactly one query/cache to keep correct.
//
// v3 of this pool (see ELIGIBLE_POOL_CACHE_KEY_VERSION below) pushes
// gender/lookingFor/intent/distance-or-city into the SQL WHERE clause
// instead of pulling an arbitrary top-N-by-recency slice of an entire
// city and filtering it in JS afterward. That arbitrary slice was fine
// while every city had a few hundred profiles (true during development),
// but doesn't hold at the scale this app is built for: once a city has
// far more active profiles than any one cap, "most recently active 500
// in the whole city, regardless of gender/intent/distance" can easily
// contain few or none of what a given viewer is actually eligible to see,
// even though plenty of eligible people exist deeper in that city's full
// population. Filtering in SQL first means the cap is applied to an
// already-relevant set, not an arbitrary one.

// How many eligible candidates (already filtered by gender/lookingFor/
// intent/distance-or-city in SQL) to rank per request/cache entry. This
// is no longer "the whole city capped," it's "a deep, relevant slice,"
// so it can -- and should -- be much bigger than the old city-wide v2
// pool's 500 while still being cheap: the query itself is now bounded by
// a spatial/categorical WHERE clause and an index-backed ORDER BY, not a
// full-table scan.
export const ELIGIBLE_POOL_LIMIT = 3000;

// Same-cell, same-filters pool is identical for every viewer who shares
// all of (city, gender, lookingFor, intent, grid cell) -- see
// lib/geo.ts's gridCellFor doc comment for what "grid cell" means and
// why it's necessary now that the query is distance-aware. Cached per
// that combination rather than re-queried from Postgres on every single
// request. 45s is short enough that a newly active user shows up almost
// immediately, long enough to absorb a burst of concurrent requests with
// the same filters from the same area with one DB round trip. Falls back
// to querying the database directly if the Upstash cache isn't configured
// (see lib/cache.ts) -- behaves identically either way, just faster once
// the cache is on.
const ELIGIBLE_POOL_CACHE_TTL_SECONDS = 45;
const ELIGIBLE_POOL_CACHE_KEY_VERSION = 'v3';

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
 * SQL for "this profile's best-known point as a geography value" --
 * COALESCE(real opted-in point, this profile's city centroid). Built from
 * lib/geo.ts's CITY_CENTROIDS (the exact same table effectiveCoords() uses
 * in JS for the display-distance fallback) rather than a second hardcoded
 * copy in SQL, so the two can never drift apart.
 */
function effectiveGeoSql() {
  const branches = Object.entries(CITY_CENTROIDS).map(
    ([city, { lat, lng }]) => Prisma.sql`WHEN ${city} THEN ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`,
  );
  return Prisma.sql`COALESCE("geoLocation", CASE "city" ${Prisma.join(branches, ' ')} END)`;
}

export interface EligiblePoolParams {
  city: string;
  viewerUserId: string;
  viewerGender: Gender;
  viewerLookingFor: Gender[];
  viewerIntent: IntentType;
  /** Query origin -- effective (GPS-or-centroid) coordinates for an exact
   * per-viewer query, or a grid cell's center for a cacheable one (see
   * getEligibleCandidatePool below). */
  viewerLat: number;
  viewerLng: number;
}

export type EligiblePoolRow = {
  userId: string;
  gender: string;
  lookingFor: string[];
  city: string;
  intent: string;
  quietMode: boolean;
  latitude: number | null;
  longitude: number | null;
  lastActiveAt: Date;
};

/**
 * The actual SQL query -- shared by the cached pool below and by
 * app/api/discover/search/route.ts (which needs the same eligibility
 * filtering but deliberately skips the cache; see that file's comment on
 * why a search needs fresher, wider-shaped rows than the ordinary feed).
 *
 * This is a performance/pool-composition layer only. It mirrors
 * lib/matching.ts's isEligibleCandidate() (mutual gender match, intent
 * compatibility, intent's distance-or-city rule), but isEligibleCandidate
 * itself is still run again, unchanged, in JS over whatever this returns
 * -- see lib/geo.ts's gridCellFor doc comment for why that matters (this
 * query is deliberately a little generous, never a little strict).
 */
export async function queryEligiblePool(params: EligiblePoolParams, limit: number): Promise<EligiblePoolRow[]> {
  const { city, viewerUserId, viewerGender, viewerLookingFor, viewerIntent, viewerLat, viewerLng } = params;

  const radiusKm = DISTANCE_RADIUS_KM[viewerIntent];
  const radiusMeters = (radiusKm + GRID_CELL_RADIUS_PADDING_KM) * 1000;
  const originSql = Prisma.sql`ST_SetSRID(ST_MakePoint(${viewerLng}, ${viewerLat}), 4326)::geography`;
  const withinRadiusSql = Prisma.sql`ST_DWithin(${effectiveGeoSql()}, ${originSql}, ${radiusMeters})`;
  // Mirrors lib/matching.ts's hasLocationPath(): Just Vibing is
  // distance-only; Something Real / Rishta Ready accept same-city OR
  // within radius (distance is a tiebreaker there, not a requirement).
  const locationSql = viewerIntent === 'JUST_VIBING' ? withinRadiusSql : Prisma.sql`("city" = ${city} OR ${withinRadiusSql})`;

  return db.$queryRaw<EligiblePoolRow[]>`
    SELECT p."userId", p.gender, p."lookingFor", p.city, p.intent, p."quietMode",
           p.latitude, p.longitude, u."lastActiveAt"
    FROM "Profile" p
    JOIN "User" u ON u.id = p."userId"
    WHERE p.city = ${city}
      AND p."quietMode" = false
      AND u.status = 'ACTIVE'
      AND u."discoveryRestricted" = false
      AND u."profileHidden" = false
      AND p."userId" != ${viewerUserId}
      AND p.gender = ANY(${viewerLookingFor})
      AND ${viewerGender} = ANY(p."lookingFor")
      AND p.intent = ANY(${compatibleIntents(viewerIntent)})
      AND ${locationSql}
    ORDER BY u."lastActiveAt" DESC
    LIMIT ${limit}
  `;
}

/**
 * interests aren't part of the raw query above (no join needed for
 * eligibility/location filtering, and an implicit Prisma many-to-many
 * join table isn't something a hand-written raw query should depend on
 * the exact name of) -- fetched separately via the normal query builder,
 * batched over every userId the pool query returned.
 */
async function loadInterestIds(userIds: string[]): Promise<Map<string, string[]>> {
  if (userIds.length === 0) return new Map();
  const rows = await db.profile.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, interests: { select: { id: true } } },
  });
  return new Map(rows.map((r) => [r.userId, r.interests.map((i) => i.id)]));
}

async function toMatchablePool(rows: EligiblePoolRow[]): Promise<MatchableProfile[]> {
  const interestsByUserId = await loadInterestIds(rows.map((r) => r.userId));
  return rows.map((row) =>
    toMatchable({
      userId: row.userId,
      gender: row.gender,
      lookingFor: row.lookingFor,
      city: row.city,
      intent: row.intent,
      quietMode: row.quietMode,
      interests: (interestsByUserId.get(row.userId) ?? []).map((id) => ({ id })),
      user: { lastActiveAt: row.lastActiveAt },
      latitude: row.latitude,
      longitude: row.longitude,
    }),
  );
}

/**
 * Eligible-candidate pool for one viewer, cached per (city, gender,
 * lookingFor, intent, grid cell) -- see the file-level comment and
 * lib/geo.ts's gridCellFor for why those five things are exactly what
 * this is cacheable by. `viewer` should already carry effective
 * (GPS-or-centroid) coordinates -- see toMatchable/effectiveCoords.
 */
export async function getEligibleCandidatePool(viewer: MatchableProfile): Promise<MatchableProfile[]> {
  if (viewer.latitude == null || viewer.longitude == null) {
    // Should not happen in practice -- every supported city has a
    // centroid fallback (see lib/geo.ts's CITY_CENTROIDS / CITIES in
    // lib/constants.ts) -- but fail to an empty pool rather than letting
    // a malformed point reach Postgres as the ST_DWithin origin.
    return [];
  }

  const cell = gridCellFor(viewer.latitude, viewer.longitude);
  const lookingForKey = [...viewer.lookingFor].sort().join(',');
  const cacheKey = `discover:pool:${ELIGIBLE_POOL_CACHE_KEY_VERSION}:${viewer.city}:${viewer.gender}:${lookingForKey}:${viewer.intent}:${cell.key}`;

  const cached = await cacheGet<MatchableProfile[]>(cacheKey);
  if (cached) {
    // Round-tripping through JSON (cacheSet/cacheGet) turns Date fields into
    // ISO strings -- scoreCandidate()/scoreWildCardCandidate() in
    // lib/matching.ts call .getTime() on lastActiveAt, so this has to be a
    // real Date again before use.
    return cached.map((c) => ({ ...c, lastActiveAt: new Date(c.lastActiveAt) }));
  }

  const rows = await queryEligiblePool(
    {
      city: viewer.city,
      viewerUserId: viewer.userId,
      viewerGender: viewer.gender,
      viewerLookingFor: viewer.lookingFor,
      viewerIntent: viewer.intent,
      // Query from the CELL's center, not the viewer's exact point -- see
      // lib/geo.ts's gridCellFor doc comment. Every viewer in this cell
      // shares this exact query/cache entry.
      viewerLat: cell.centerLat,
      viewerLng: cell.centerLng,
    },
    ELIGIBLE_POOL_LIMIT,
  );

  const pool = await toMatchablePool(rows);
  await cacheSet(cacheKey, pool, ELIGIBLE_POOL_CACHE_TTL_SECONDS);
  return pool;
}
