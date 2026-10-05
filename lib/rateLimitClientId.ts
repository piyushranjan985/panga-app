import crypto from 'node:crypto';
import { cookies } from 'next/headers';

/**
 * Split out of lib/otpRateLimit.ts specifically so that file -- which
 * holds every pure, unit-tested rate-limit decision function -- never
 * needs to import `next/headers`. This is the one piece of the OTP
 * abuse-protection story that genuinely needs it.
 */

const RATE_LIMIT_CLIENT_COOKIE = 'findmyvybe_rlid';
const RATE_LIMIT_CLIENT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * A best-effort, anonymous correlation id -- NOT a security boundary
 * (it's trivially cleared or never sent at all from a non-browser
 * client), just one more weak signal alongside the IP and per-
 * destination limits that actually hold the line, per the original
 * ask's "per device/session where practical." Set once, read on every
 * later OTP request from the same browser, and recorded on the OtpCode
 * row purely for monitoring (e.g. "did this one browser profile touch
 * 30 different phone numbers today") -- nothing currently rate-limits
 * on it directly.
 */
export async function getOrCreateRateLimitClientId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(RATE_LIMIT_CLIENT_COOKIE)?.value;
  if (existing) return existing;

  const id = crypto.randomBytes(16).toString('hex');
  store.set(RATE_LIMIT_CLIENT_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: RATE_LIMIT_CLIENT_COOKIE_MAX_AGE_SECONDS,
  });
  return id;
}
