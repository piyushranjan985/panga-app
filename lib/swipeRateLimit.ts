/**
 * Swipe volume cap -- see docs/DATA_RETENTION.md S3. Deliberately kept
 * free of any Next.js/Prisma import, same convention as
 * lib/otpRateLimit.ts: a plain, synchronous, DB-free decision given a
 * plain number. app/api/swipe/route.ts is what wires this against the
 * real Swipe table's COUNT query.
 *
 * This is NOT a monetization paywall -- contrast Bumble's 25/day or
 * Hinge's 8/day free-tier limits, both deliberately low to push users
 * toward a paid unlimited tier. findmyVybe has no swipe paywall, so this
 * exists purely as a cost/abuse safety valve: it bounds how many new
 * rows one account can add to the Swipe table per day (the table's
 * growth driver -- see docs/DATA_RETENTION.md S1) and slows down
 * scraping/bot-like discovery consumption. The default (50) is set high
 * enough that a genuine user swiping normally should essentially never
 * see it -- it's well above Bumble's 25 and in the same range as
 * Tinder's historical ~50-100, deliberately on the generous end since
 * the goal here is a safety valve, not engagement gating.
 */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getSwipeDailyLimit(): number {
  return envInt('SWIPE_DAILY_LIMIT', 50);
}

/**
 * Pure comparison, same shape as lib/otpRateLimit.ts's
 * evaluateOtpRequestCounts -- the caller is responsible for the actual
 * COUNT query (a rolling 24h window, same reset style Bumble uses,
 * rather than a fixed midnight reset that'd let someone burst twice
 * around the boundary).
 */
export function evaluateSwipeCount(limit: number, countLast24h: number): { ok: true } | { ok: false } {
  if (countLast24h >= limit) return { ok: false };
  return { ok: true };
}
