import crypto from 'node:crypto';
import { db } from '@/lib/db';

/**
 * Shared one-time-code logic used by both the phone flow and the email
 * flow — the OtpCode table doesn't care which channel a code was sent
 * through, only which user it belongs to. Keeping this in one place means
 * "how OTPs are generated/checked" only has to be gotten right once.
 *
 * Access model: sign-up/sign-in is open to any phone number or email --
 * there's no per-person allowlist on this path (see mock-google/
 * mock-facebook and the real OAuth callbacks for the one place an
 * allowlist, lib/auth/betaAllowlist.ts, is still used). What gates entry
 * here is knowing MOCK_OTP, a fixed code that's never included in any
 * API response or UI. Two things keep that fixed code from being brute
 * forced: REQUEST_COOLDOWN_SECONDS caps how often a fresh OtpCode row can
 * be issued for a given user (so an attacker can't just keep resetting
 * the attempt counter), and MAX_ATTEMPTS caps wrong guesses against any
 * one row. Swap MOCK_OTP for a real per-request random code (the
 * `provider !== 'mock'` branch already does this) and wire up a real SMS/
 * email provider before this is a substitute for verifying someone
 * actually owns the number/address -- right now it only proves they know
 * the shared code.
 */

export const MOCK_OTP = '43364336';
const OTP_TTL_MINUTES = 5;
const MAX_ATTEMPTS = 10;
const REQUEST_COOLDOWN_SECONDS = 20;

export function hashOtp(code: string) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

export type IssueOtpResult = { ok: true } | { ok: false; reason: 'rate_limited' };

/**
 * Creates and stores a fresh OTP for a user. In dev/mock mode (the
 * default) this always issues the static code in MOCK_OTP and never
 * calls a real SMS/email provider — see .env.example. Swap the mock
 * branch for MSG91 / Gupshup / Twilio Verify (phone) or Postmark / SES
 * (email) before shipping to real users.
 *
 * Refuses to issue a new code (and therefore reset the attempt counter
 * on the previous one — see consumeOtp) more than once every
 * REQUEST_COOLDOWN_SECONDS for the same user.
 */
export async function issueOtp(userId: string): Promise<IssueOtpResult> {
  const mostRecent = await db.otpCode.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (mostRecent && Date.now() - mostRecent.createdAt.getTime() < REQUEST_COOLDOWN_SECONDS * 1000) {
    return { ok: false, reason: 'rate_limited' };
  }

  const provider = process.env.OTP_PROVIDER ?? 'mock';
  const code = provider === 'mock' ? MOCK_OTP : crypto.randomInt(100000, 999999).toString();

  await db.otpCode.create({
    data: {
      userId,
      codeHash: hashOtp(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
    },
  });

  if (provider !== 'mock') {
    // TODO: call the real SMS/email provider here with `code`.
  }

  return { ok: true };
}

export type OtpConsumeFailureReason = 'not_found' | 'already_used' | 'expired' | 'mismatch' | 'too_many_attempts';

export type OtpConsumeResult = { ok: true } | { ok: false; reason: OtpConsumeFailureReason };

/**
 * Consumes the code if it's valid; otherwise says specifically why not,
 * instead of a single opaque `false` that collapses "never requested a
 * code", "code already used", "code expired", "guessed wrong too many
 * times", and "typed the wrong digits" into the same generic "wrong or
 * expired" message every caller shows. That message is deliberately
 * vague for a real end user (no reason to help someone brute-forcing
 * OTPs tell which guess got close), but it's genuinely unhelpful for
 * local development, where the code is always the constant MOCK_OTP and
 * any failure at all means something about the *setup* is wrong, not a
 * mistyped digit -- see app/api/auth/verify-otp/route.ts and
 * verify-email-otp/route.ts, which both surface `reason` in the
 * response, but ONLY when NODE_ENV==='development' (never in
 * production).
 *
 * Looks up the single latest OtpCode row for this user, unconditionally
 * (not filtered by codeHash), so "wrong code" is distinguished from
 * "right code, but it's not the current one" -- the previous version
 * filtered by codeHash *and* ordered by recency, which meant an older,
 * still-unexpired code could be accepted even after a newer one was
 * issued, and gave no way to tell that apart from a genuine typo.
 *
 * Once a row hits MAX_ATTEMPTS wrong guesses it's permanently dead
 * (checked before comparing the new guess at all, so an eventual correct
 * guess still doesn't work) -- request a fresh code to get a fresh
 * counter, subject to issueOtp's cooldown.
 */
export async function consumeOtp(userId: string, code: string): Promise<OtpConsumeResult> {
  const latest = await db.otpCode.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  if (!latest) return { ok: false, reason: 'not_found' };
  if (latest.consumedAt) return { ok: false, reason: 'already_used' };
  if (latest.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'too_many_attempts' };
  if (latest.expiresAt.getTime() <= Date.now()) return { ok: false, reason: 'expired' };

  if (latest.codeHash !== hashOtp(code)) {
    await db.otpCode.update({ where: { id: latest.id }, data: { attempts: { increment: 1 } } });
    return { ok: false, reason: 'mismatch' };
  }

  await db.otpCode.update({ where: { id: latest.id }, data: { consumedAt: new Date() } });
  return { ok: true };
}
