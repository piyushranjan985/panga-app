/**
 * Haversine great-circle distance -- the standard approach dating apps use
 * for "X km away": store each profile's last-shared lat/lng (opt-in,
 * browser Geolocation API), then compute distance on the server for any
 * pair that both have it set. Deliberately not part of lib/matching.ts's
 * scoring -- discovery eligibility is still same-city (see matching.ts),
 * this is purely a display signal, like Tinder/Hinge showing "3 miles
 * away" alongside (not instead of) their own ranking.
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
 * Approximate centroid for each of VybeMatch's supported cities (see
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
function effectiveCoords(p: DistanceSource | null | undefined): { lat: number; lng: number; exact: boolean } | null {
  if (p?.latitude != null && p?.longitude != null) return { lat: p.latitude, lng: p.longitude, exact: true };
  const centroid = p?.city ? CITY_CENTROIDS[p.city] : undefined;
  return centroid ? { lat: centroid.lat, lng: centroid.lng, exact: false } : null;
}

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
