import crypto from 'node:crypto';
import { db } from '@/lib/db';

/**
 * Shared one-time-code logic used by both the phone flow and the email
 * flow — the OtpCode table doesn't care which channel a code was sent
 * through, only which user it belongs to. Keeping this in one place means
 * "how OTPs are generated/checked" only has to be gotten right once.
 */

export const MOCK_OTP = '123456';
const OTP_TTL_MINUTES = 5;

export function hashOtp(code: string) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

/**
 * Creates and stores a fresh OTP for a user. In dev/mock mode (the default)
 * this always issues the static code 123456 and never calls a real
 * SMS/email provider — see .env.example. Swap the mock branch for
 * MSG91 / Gupshup / Twilio Verify (phone) or Postmark / SES (email) before
 * shipping to real users.
 */
export async function issueOtp(userId: string) {
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

  return {
    provider,
    devHint: provider === 'mock' ? `Dev mode: use OTP ${MOCK_OTP}` : undefined,
  };
}

export type OtpConsumeFailureReason = 'not_found' | 'already_used' | 'expired' | 'mismatch';

export type OtpConsumeResult = { ok: true } | { ok: false; reason: OtpConsumeFailureReason };

/**
 * Consumes the code if it's valid; otherwise says specifically why not,
 * instead of a single opaque `false` that collapses "never requested a
 * code", "code already used", "code expired", and "typed the wrong
 * digits" into the same generic "wrong or expired" message every caller
 * shows. That message is deliberately vague for a real end user (no
 * reason to help someone brute-forcing OTPs tell which guess got close),
 * but it's genuinely unhelpful for local development, where the code is
 * always the constant MOCK_OTP and any failure at all means something
 * about the *setup* is wrong, not a mistyped digit -- see
 * app/api/auth/verify-otp/route.ts and verify-email-otp/route.ts, which
 * both surface `reason` in the response, but ONLY when
 * NODE_ENV==='development' (never in production).
 *
 * Looks up the single latest OtpCode row for this user, unconditionally
 * (not filtered by codeHash), so "wrong code" is distinguished from
 * "right code, but it's not the current one" -- the previous version
 * filtered by codeHash *and* ordered by recency, which meant an older,
 * still-unexpired code could be accepted even after a newer one was
 * issued, and gave no way to tell that apart from a genuine typo.
 */
export async function consumeOtp(userId: string, code: string): Promise<OtpConsumeResult> {
  const latest = await db.otpCode.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  if (!latest) return { ok: false, reason: 'not_found' };
  if (latest.consumedAt) return { ok: false, reason: 'already_used' };
  if (latest.expiresAt.getTime() <= Date.now()) return { ok: false, reason: 'expired' };
  if (latest.codeHash !== hashOtp(code)) return { ok: false, reason: 'mismatch' };

  await db.otpCode.update({ where: { id: latest.id }, data: { consumedAt: new Date() } });
  return { ok: true };
}
