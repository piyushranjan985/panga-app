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

/** Distance label between two profiles, or null if either hasn't shared a
 * location -- callers should simply omit the distance UI in that case
 * rather than showing a placeholder. */
export function distanceLabel(
  a: { latitude: number | null; longitude: number | null } | null | undefined,
  b: { latitude: number | null; longitude: number | null } | null | undefined
): string | null {
  if (a?.latitude == null || a?.longitude == null || b?.latitude == null || b?.longitude == null) return null;
  return formatDistance(haversineKm(a.latitude, a.longitude, b.latitude, b.longitude));
}
