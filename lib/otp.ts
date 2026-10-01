import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { isRealProductionDeployment } from '@/lib/env';
import { isMsg91Configured, sendOtpSms } from '@/lib/notifications/sms';
import { isBrevoConfigured, sendTransactionalEmail } from '@/lib/notifications/email';

/**
 * Shared one-time-code logic used by both the phone flow and the email
 * flow — the OtpCode table doesn't care which channel a code was sent
 * through, only which user it belongs to. Keeping this in one place means
 * "how OTPs are generated/checked" only has to be gotten right once.
 *
 * Access model: sign-up/sign-in is open to any phone number or email --
 * there's no per-person allowlist on this path (see mock-google and
 * the real Google OAuth callback for the one place an
 * allowlist, lib/auth/betaAllowlist.ts, is still used). What gates entry
 * here used to be knowing MOCK_OTP alone (a fixed code never shown in
 * any API response or UI) -- now it's whichever is true per channel:
 * isChannelConfigured() true means a real MSG91 SMS / Brevo email with a
 * fresh random code actually gets sent (lib/notifications/sms.ts,
 * lib/notifications/email.ts); false means the fixed MOCK_OTP, same as
 * before, for local/preview dev. REQUEST_COOLDOWN_SECONDS and
 * MAX_ATTEMPTS below apply identically either way.
 */

export const MOCK_OTP = '43364336';
const OTP_TTL_MINUTES = 5;
const MAX_ATTEMPTS = 10;
const REQUEST_COOLDOWN_SECONDS = 20;

export type OtpChannel = 'phone' | 'email';

export function hashOtp(code: string) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

/**
 * Whether this channel has a real provider wired up -- MSG91 for phone,
 * Brevo for email (see lib/notifications/*.ts for setup). Mirrors the
 * same "presence of real credentials, not a separate provider-name flag"
 * pattern lib/auth/googleOAuth.ts's isGoogleOAuthConfigured() and
 * lib/safety/identityVerification.ts's isDigilockerConfigured() already
 * use elsewhere in this app, rather than this file's previous single
 * OTP_PROVIDER string covering both channels at once (which couldn't
 * express "email is live, phone isn't yet" or vice versa).
 */
export function isChannelConfigured(channel: OtpChannel): boolean {
  return channel === 'phone' ? isMsg91Configured() : isBrevoConfigured();
}

/**
 * True when nothing stands between "anyone on earth" and "a session for
 * any phone number or email on THIS channel" except the fixed,
 * hardcoded MOCK_OTP -- sitting in this file's source, not a secret in
 * any real sense -- AND this is a real production deployment (see
 * lib/env.ts), not a Preview or local build where the mock code is
 * exactly the point.
 *
 * issueOtp() and consumeOtp() both refuse outright when this is true for
 * the channel in play (fail CLOSED, not safe-degraded -- unlike
 * imageModeration.ts's production guard, there's no reviewed-queue
 * equivalent for "let someone in and check later": a login either is or
 * isn't this person). The fix: configure that channel's real provider
 * (see lib/notifications/sms.ts / email.ts's setup notes) in Vercel's
 * Production environment.
 */
export function isMockOtpUnsafeInProduction(channel: OtpChannel): boolean {
  return !isChannelConfigured(channel) && isRealProductionDeployment();
}

export type IssueOtpResult =
  | { ok: true }
  | { ok: false; reason: 'rate_limited' | 'provider_not_configured' | 'send_failed' };

/**
 * Creates and stores a fresh OTP for a user, and -- when this channel's
 * real provider is configured (isChannelConfigured()) -- actually sends
 * it: a real random 6-digit code via MSG91 SMS or Brevo email. When it
 * isn't configured, this always issues the static MOCK_OTP and never
 * calls out to either provider, exactly like before (see .env.example).
 *
 * Refuses to issue a new code (and therefore reset the attempt counter
 * on the previous one — see consumeOtp) more than once every
 * REQUEST_COOLDOWN_SECONDS for the same user.
 */
export async function issueOtp(userId: string, destination: string, channel: OtpChannel): Promise<IssueOtpResult> {
  if (isMockOtpUnsafeInProduction(channel)) {
    console.error(
      `[otp] SAFETY GUARD: no real ${channel} provider is configured on a production deployment ` +
        '(VERCEL_ENV=production) -- refusing to issue a code. The fixed mock code would otherwise ' +
        'authenticate as ANY phone number or email with zero real verification. Configure ' +
        `${channel === 'phone' ? 'MSG91 (lib/notifications/sms.ts)' : 'Brevo (lib/notifications/email.ts)'} ` +
        'in Vercel (Production) -- see .env.example.',
    );
    return { ok: false, reason: 'provider_not_configured' };
  }

  const mostRecent = await db.otpCode.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (mostRecent && Date.now() - mostRecent.createdAt.getTime() < REQUEST_COOLDOWN_SECONDS * 1000) {
    return { ok: false, reason: 'rate_limited' };
  }

  const useRealProvider = isChannelConfigured(channel);
  const code = useRealProvider ? crypto.randomInt(100000, 999999).toString() : MOCK_OTP;

  await db.otpCode.create({
    data: {
      userId,
      codeHash: hashOtp(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
    },
  });

  if (useRealProvider) {
    try {
      if (channel === 'phone') {
        await sendOtpSms(destination, code, OTP_TTL_MINUTES);
      } else {
        await sendTransactionalEmail({
          to: destination,
          subject: `${code} is your findmyVybe verification code`,
          text: `Your findmyVybe verification code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.\n\nIf you didn't request this, you can safely ignore this email.`,
          html: `<p>Your findmyVybe verification code is <strong style="font-size:1.2em;letter-spacing:0.1em">${code}</strong>.</p><p>It expires in ${OTP_TTL_MINUTES} minutes.</p><p style="color:#666;font-size:0.9em">If you didn't request this, you can safely ignore this email.</p>`,
        });
      }
    } catch (err) {
      // The OtpCode row above already exists -- a stuck row that can
      // never be delivered isn't dangerous (it just expires unused,
      // same as any code the user never typed in), but returning ok:true
      // here would tell the caller "a code is on its way" when it isn't.
      // Surfacing this as its own reason (rather than reusing
      // rate_limited) lets the route give an honest "something went
      // wrong sending that" message instead of the misleading cooldown
      // one.
      console.error(`[otp] ${channel} provider send failed`, err);
      return { ok: false, reason: 'send_failed' };
    }
  }

  return { ok: true };
}

export type OtpConsumeFailureReason =
  | 'not_found'
  | 'already_used'
  | 'expired'
  | 'mismatch'
  | 'too_many_attempts'
  | 'provider_not_configured';

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
export async function consumeOtp(userId: string, code: string, channel: OtpChannel): Promise<OtpConsumeResult> {
  // Belt-and-suspenders alongside issueOtp()'s same check: if this
  // channel's provider somehow became unconfigured mid-flight (a code
  // issued while configured, then the credentials got removed), a code
  // already in the table still can't be consumed in real production
  // either.
  if (isMockOtpUnsafeInProduction(channel)) {
    console.error('[otp] SAFETY GUARD: refusing to verify a code -- see issueOtp\'s matching guard.');
    return { ok: false, reason: 'provider_not_configured' };
  }

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
