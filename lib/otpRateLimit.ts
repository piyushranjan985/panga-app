/**
 * OTP abuse/cost protection -- see docs/OTP_SECURITY.md. Deliberately
 * kept free of any Next.js-framework import (no `next/headers`, no
 * Prisma) so every function here is a plain, synchronous, DB-free
 * decision given plain numbers/strings -- exactly what
 * tests/otpRateLimit.test.ts exercises, matching this repo's existing
 * convention (admin/tests/*.test.ts) of unit-testing pure logic only,
 * never standing up a real/mocked database or Next.js request context in
 * a test run. clientIpFromRequest below only touches the plain `Request`
 * type (a Node/Fetch global, not a Next.js import), so it stays here
 * too; getOrCreateRateLimitClientId -- the one piece that genuinely needs
 * `cookies()` from `next/headers` -- lives in lib/rateLimitClientId.ts
 * instead, specifically so importing *this* file never pulls in Next's
 * request-scoped machinery. lib/otp.ts's issueOtp() is what wires all of
 * this together against the real OtpCode table -- see that file for the
 * actual COUNT queries.
 */

// ---------------------------------------------------------------------------
// Config -- every number here is env-overridable with no code change and no
// redeploy beyond setting the var in Vercel, per the original ask.
// ---------------------------------------------------------------------------

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Like envInt, but unset/invalid means "no limit" (null) rather than a fallback number -- used only for the optional global safety valve, which has no sensible default cap. */
function envIntOrNull(name: string): number | null {
  const raw = process.env[name];
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  // Any other value (a typo like "flase", "1", "yes") falls back to the
  // default rather than silently resolving to false -- for a kill switch
  // like OTP_ENABLED, a malformed env value should never accidentally
  // disable the feature it's meant to only deliberately disable.
  return fallback;
}

export interface OtpRateLimitConfig {
  /** Emergency kill switch -- OTP_ENABLED="false" refuses EVERY OTP issuance (phone and email, real or mock) immediately, no deploy needed. Distinct from MOCK_MODE_PHONE/EMAIL (lib/otp.ts), which keeps the flow working on a fixed mock code -- this stops it outright, for an active-abuse or runaway-cost situation. */
  enabled: boolean;
  resendCooldownSeconds: number;
  expirySeconds: number;
  maxAttempts: number;
  maxPerPhonePerHour: number;
  maxPerPhonePerDay: number;
  maxPerEmailPerHour: number;
  maxPerEmailPerDay: number;
  maxPerIpPerHour: number;
  maxPerIpPerDay: number;
  /** null = no global cap (the default -- most deployments don't need one until real volume shows otherwise). */
  maxGlobalPerHour: number | null;
  progressiveCooldownEnabled: boolean;
  /** How far back to count "recent requests to this destination" when deciding how much to escalate the cooldown. */
  progressiveCooldownLookbackHours: number;
  progressiveCooldownMaxSeconds: number;
  /** Daily cap substituted in place of the normal per-destination limit when isSuspiciousPhoneNumber() flags the number -- a soft throttle, not a hard block, so an unlucky false positive can still get through once. */
  suspiciousNumberDailyLimit: number;
}

export function getOtpRateLimitConfig(): OtpRateLimitConfig {
  return {
    enabled: envBool('OTP_ENABLED', true),
    resendCooldownSeconds: envInt('OTP_RESEND_COOLDOWN_SECONDS', 60),
    expirySeconds: envInt('OTP_EXPIRY_SECONDS', 300),
    maxAttempts: envInt('OTP_MAX_ATTEMPTS', 10),
    maxPerPhonePerHour: envInt('OTP_MAX_REQUESTS_PER_PHONE_PER_HOUR', 5),
    maxPerPhonePerDay: envInt('OTP_MAX_REQUESTS_PER_PHONE_PER_DAY', 10),
    maxPerEmailPerHour: envInt('OTP_MAX_REQUESTS_PER_EMAIL_PER_HOUR', 5),
    maxPerEmailPerDay: envInt('OTP_MAX_REQUESTS_PER_EMAIL_PER_DAY', 10),
    maxPerIpPerHour: envInt('OTP_MAX_REQUESTS_PER_IP_PER_HOUR', 20),
    maxPerIpPerDay: envInt('OTP_MAX_REQUESTS_PER_IP_PER_DAY', 60),
    maxGlobalPerHour: envIntOrNull('OTP_MAX_REQUESTS_GLOBAL_PER_HOUR'),
    progressiveCooldownEnabled: envBool('OTP_PROGRESSIVE_COOLDOWN_ENABLED', true),
    progressiveCooldownLookbackHours: envInt('OTP_PROGRESSIVE_COOLDOWN_LOOKBACK_HOURS', 3),
    progressiveCooldownMaxSeconds: envInt('OTP_PROGRESSIVE_COOLDOWN_MAX_SECONDS', 1800),
    suspiciousNumberDailyLimit: envInt('OTP_SUSPICIOUS_NUMBER_DAILY_LIMIT', 1),
  };
}

// ---------------------------------------------------------------------------
// Pure decision functions -- no DB, no headers/cookies, fully unit-testable.
// ---------------------------------------------------------------------------

/**
 * How long the NEXT resend cooldown should be, given how many times this
 * destination has already requested a code within the lookback window.
 * recentRequestCount is "how many prior requests already happened in the
 * window", so a brand-new destination (0 prior requests) always gets the
 * plain base cooldown -- only a destination that keeps coming back inside
 * the same window gets escalated, doubling each additional request up to
 * progressiveCooldownMaxSeconds.
 */
export function computeProgressiveCooldownSeconds(
  baseSeconds: number,
  recentRequestCount: number,
  maxSeconds: number,
): number {
  if (recentRequestCount <= 0) return baseSeconds;
  const exponent = Math.min(recentRequestCount, 6); // bounds the math; maxSeconds is what actually caps the real-world value
  return Math.min(baseSeconds * 2 ** exponent, maxSeconds);
}

/**
 * Deliberately conservative: flags only a short list of obviously-fake
 * test/bot patterns (all-same-digit, and the two canonical
 * ascending/descending 10-digit runs), not a general "any sequential
 * run" detector. A broad sequential-run rule would also catch this
 * repo's own placeholder example number (+919876543210, used in
 * app/login/page.tsx's input placeholder and .env.example) and real
 * numbers that just happen to be locally sequential -- low precision for
 * no real gain. This only ever softens the per-destination daily limit
 * (see suspiciousNumberDailyLimit above), never hard-blocks, so an
 * unlucky coincidence still gets one code through.
 */
export function isSuspiciousPhoneNumber(e164: string): boolean {
  const digits = e164.replace(/^\+91/, '');
  if (!/^\d{10}$/.test(digits)) return false; // not a shape this heuristic recognizes -- don't flag what it can't actually assess
  const KNOWN_TEST_PATTERNS = new Set(['1234567890', '0123456789', '9876543210', '0987654321']);
  if (KNOWN_TEST_PATTERNS.has(digits)) return true;
  if (/^(\d)\1{9}$/.test(digits)) return true; // all ten digits identical
  return false;
}

export interface OtpRequestLimits {
  destinationPerHour: number;
  destinationPerDay: number;
  ipPerHour: number;
  ipPerDay: number;
  /** null = not enforced. */
  globalPerHour: number | null;
}

export interface OtpRequestCounts {
  destinationHour: number;
  destinationDay: number;
  /** null when no IP was available to count against (header missing) -- never enforced in that case, rather than treating "unknown" as "zero". */
  ipHour: number | null;
  ipDay: number | null;
  /** null when globalPerHour isn't configured, so the caller can skip that COUNT query entirely. */
  globalHour: number | null;
}

export type OtpRequestRejectionReason =
  | 'destination_hourly_limit'
  | 'destination_daily_limit'
  | 'ip_hourly_limit'
  | 'ip_daily_limit'
  | 'global_hourly_limit';

export type OtpRequestDecision = { ok: true } | { ok: false; reason: OtpRequestRejectionReason };

/**
 * Pure comparison of already-gathered counts against already-resolved
 * limits -- it doesn't know or care WHY a limit is what it is (the
 * caller is responsible for e.g. substituting suspiciousNumberDailyLimit
 * in place of the normal destinationPerDay before calling this).
 * Checked tightest-and-cheapest-to-explain first: the requester's own
 * destination/IP limits before the shared global one, so a normal
 * person hitting a normal limit gets a specific, true reason rather than
 * a generic "the whole system is busy" message that's actually about
 * someone else's abuse.
 */
export function evaluateOtpRequestCounts(limits: OtpRequestLimits, counts: OtpRequestCounts): OtpRequestDecision {
  if (counts.destinationHour >= limits.destinationPerHour) return { ok: false, reason: 'destination_hourly_limit' };
  if (counts.destinationDay >= limits.destinationPerDay) return { ok: false, reason: 'destination_daily_limit' };
  if (counts.ipHour !== null && counts.ipHour >= limits.ipPerHour) return { ok: false, reason: 'ip_hourly_limit' };
  if (counts.ipDay !== null && counts.ipDay >= limits.ipPerDay) return { ok: false, reason: 'ip_daily_limit' };
  if (limits.globalPerHour !== null && counts.globalHour !== null && counts.globalHour >= limits.globalPerHour) {
    return { ok: false, reason: 'global_hourly_limit' };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Request/cookie helpers -- these touch the request or cookie jar, so they
// live here rather than in the pure section above, but still do no DB work.
// ---------------------------------------------------------------------------

/** x-forwarded-for (Vercel sets this) with x-real-ip as a fallback -- same extraction lib/trustedDevice.ts's requestMeta() uses, duplicated rather than imported since this runs from a plain Request in a route handler, not from next/headers()'s headers(). */
export function clientIpFromRequest(req: Request): string | null {
  const h = req.headers;
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null;
}

