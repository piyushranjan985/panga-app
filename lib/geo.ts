/**
 * Haversine great-circle distance -- the standard approach dating apps use
 * for "X km away": store each profile's last-shared lat/lng (opt-in,
 * browser Geolocation API), then compute distance on the server for any
 * pair that both have it set.
 *
 * Distance IS now part of lib/matching.ts's eligibility/scoring for some
 * intents (Just Vibing is distance-first, not city-gated -- see
 * DISTANCE_RADIUS_KM there) -- matching.ts keeps its own small haversine
 * helper rather than importing this file, to stay zero-import/framework-
 * free and trivially unit-testable (see scripts/verify-matching.ts); this
 * file's haversineKm is what powers the *display* label below, and
 * effectiveCoords (also used by the discover route to populate each
 * MatchableProfile's lat/lng) is the shared source of truth for "what
 * point do we use when a profile hasn't shared precise GPS" in both
 * places.
 */

const EARTH_RADIUS_KM = 6371;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);
  const lat1 = toRadians(aLat);
  const lat2 = toRadians(bLat);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Rounds to a coarser distance before it's ever shown to someone else --
 * never exposes precision that could help triangulate an exact location.
 * "Nearby" under 1km, then whole kilometers.
 */
export function formatDistance(km: number): string {
  if (km < 1) return 'Nearby';
  return `${Math.round(km)} km away`;
}

/**
 * Approximate centroid for each of findmyVybe's supported cities (see
 * CITIES in lib/constants.ts). Discover eligibility is already same-city
 * only (see lib/matching.ts), so this is a safe, non-deceptive fallback:
 * a profile that hasn't opted into sharing its precise device location
 * still resolves to *some* real point, close to where it actually is,
 * instead of leaving distance blank for the large majority of profiles
 * that haven't granted GPS. prisma/seed.ts jitters generated profiles
 * around these points so Discover has real, varied approximate distances
 * to show out of the box, not identical "Nearby" for everyone.
 */
export const CITY_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  Bengaluru: { lat: 12.9716, lng: 77.5946 },
  Mumbai: { lat: 19.076, lng: 72.8777 },
  'Delhi NCR': { lat: 28.6139, lng: 77.209 },
  Pune: { lat: 18.5204, lng: 73.8567 },
  Kolkata: { lat: 22.5726, lng: 88.3639 },
  Hyderabad: { lat: 17.385, lng: 78.4867 },
  Chennai: { lat: 13.0827, lng: 80.2707 },
};

interface DistanceSource {
  latitude: number | null;
  longitude: number | null;
  city?: string | null;
}

/** A profile's own precise, opted-in coordinates when it has them, else
 * its city's centroid. `exact` tells distanceLabel whether the result is
 * a real GPS point or a same-city estimate. */
export function effectiveCoords(p: DistanceSource | null | undefined): { lat: number; lng: number; exact: boolean } | null {
  if (p?.latitude != null && p?.longitude != null) return { lat: p.latitude, lng: p.longitude, exact: true };
  const centroid = p?.city ? CITY_CENTROIDS[p.city] : undefined;
  return centroid ? { lat: centroid.lat, lng: centroid.lng, exact: false } : null;
}

/**
 * Grid-cell bucketing for lib/discoverPool.ts's candidate-pool cache.
 *
 * That pool query now filters candidates by real distance from the
 * VIEWER's point (ST_DWithin against Profile.geoLocation -- see
 * prisma/migrations/20261011090000_discovery_swipe_indexes). A viewer's
 * exact coordinates are effectively unique per person, so caching the
 * query result per exact point would mean one cache entry per viewer --
 * no sharing, no point in caching at all. Rounding each viewer's point to
 * a fixed-size cell lets every viewer in the same cell (with the same
 * gender/lookingFor/intent) share one cached pool instead, which is what
 * actually matters once a city has far more people than any one request
 * needs to consider.
 *
 * The trade is a small amount of positional precision: everyone in a cell
 * queries from that cell's CENTER, not their own exact point, so someone
 * near a cell's edge gets a circle drawn from a point up to roughly one
 * cell-diagonal away from where they actually are. GRID_CELL_RADIUS_PADDING_KM
 * is added to the SQL radius specifically to absorb that -- it only ever
 * makes the SQL fetch a little more inclusive, never less, because the
 * final, exact eligibility decision still comes from
 * lib/matching.ts's isEligibleCandidate() (run again, in JS, against the
 * viewer's real coordinates, over whatever SQL returns) -- the same
 * function that's always decided this, unchanged. SQL's job here is only
 * to compose a far more relevant pool out of a huge table; it was never
 * meant to be the exact cutoff by itself.
 */
const GRID_CELL_KM = 2;
const KM_PER_DEGREE_LAT = 111.32; // ~constant at any latitude

export interface GridCell {
  /** Stable, cache-key-safe identifier for this cell. */
  key: string;
  centerLat: number;
  centerLng: number;
}

export function gridCellFor(lat: number, lng: number, cellSizeKm: number = GRID_CELL_KM): GridCell {
  const kmPerDegLng = KM_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180);
  const latIndex = Math.round((lat * KM_PER_DEGREE_LAT) / cellSizeKm);
  const lngIndex = Math.round((lng * kmPerDegLng) / cellSizeKm);
  return {
    key: `${latIndex}:${lngIndex}`,
    centerLat: (latIndex * cellSizeKm) / KM_PER_DEGREE_LAT,
    centerLng: (lngIndex * cellSizeKm) / kmPerDegLng,
  };
}

// A full cell-diagonal, rounded up -- deliberately generous (see the doc
// comment above): over-padding just means SQL fetches a few more
// candidates than strictly necessary, which costs nothing correctness-
// wise since isEligibleCandidate() makes the real cutoff afterward.
export const GRID_CELL_RADIUS_PADDING_KM = Math.ceil(GRID_CELL_KM * Math.SQRT2);

/**
 * Distance label between two profiles. Uses real haversine distance when
 * both sides have shared precise location; otherwise falls back to a
 * same-city estimate (prefixed with "~") so the field still shows
 * something for the common case where one or both sides haven't opted
 * into GPS sharing. Returns null only when a city can't be resolved for
 * either side at all (should not happen for the fixed CITIES list).
 */
export function distanceLabel(a: DistanceSource | null | undefined, b: DistanceSource | null | undefined): string | null {
  const ca = effectiveCoords(a);
  const cb = effectiveCoords(b);
  if (!ca || !cb) return null;
  const formatted = formatDistance(haversineKm(ca.lat, ca.lng, cb.lat, cb.lng));
  const exact = ca.exact && cb.exact;
  return exact || formatted === 'Nearby' ? formatted : '~' + formatted;
}
