// lib/payments/swipeCap.ts
//
// The `unlimited_swipes` FeatureKey's actual enforcement -- a DAILY
// MONETIZATION cap, deliberately kept in its own file and its own env
// var, completely separate from lib/swipeRateLimit.ts's abuse/cost
// safety valve (default 50/day, meant to essentially never bind for a
// genuine user -- see that file's comment). This one is the opposite:
// it's MEANT to bind for a free user swiping normally, same category as
// Bumble's 25/day or Hinge's 8/day, so that `unlimited_swipes` is an
// actual reason to upgrade. The two caps are checked independently in
// app/api/swipe/route.ts (whichever is lower wins for a given user), and
// this one only ever applies once Free_Tier is false AND the swiper
// lacks `unlimited_swipes` -- see lib/payments/entitlements.ts's
// isFeatureLocked(). While Free_Tier is on (today's default), this cap
// is never consulted at all.
//
// Pure/DB-free, same convention as lib/swipeRateLimit.ts and
// lib/otpRateLimit.ts -- the caller runs the actual COUNT query.

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getFreeTierSwipeDailyCap(): number {
  return envInt('SWIPE_FREE_DAILY_CAP', 20);
}

export function evaluateFreeSwipeCount(cap: number, countLast24h: number): { ok: true } | { ok: false } {
  if (countLast24h >= cap) return { ok: false };
  return { ok: true };
}
