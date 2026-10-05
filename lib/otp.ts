import crypto from 'node:crypto';
import { OtpPurpose, type OtpChannel as DbOtpChannel } from '@prisma/client';
import { db } from '@/lib/db';
import { isRealProductionDeployment } from '@/lib/env';
import { isSmsProviderConfigured, sendOtpSms } from '@/lib/notifications/sms';
import { isBrevoConfigured, sendTransactionalEmail } from '@/lib/notifications/email';
import {
  getOtpRateLimitConfig,
  computeProgressiveCooldownSeconds,
  isSuspiciousPhoneNumber,
  evaluateOtpRequestCounts,
  type OtpRequestLimits,
  type OtpRequestCounts,
} from '@/lib/otpRateLimit';

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
 * isChannelConfigured() true means a real SMS (StartMessaging/MSG91) or Brevo email with a
 * fresh random code actually gets sent (lib/notifications/sms.ts,
 * lib/notifications/email.ts); false means the fixed MOCK_OTP, same as
 * before, for local/preview dev. The resend cooldown and max-attempts cap
 * (now both sourced from lib/otpRateLimit.ts's env-configurable
 * getOtpRateLimitConfig(), see docs/OTP_SECURITY.md) apply identically
 * either way.
 *
 * MOCK_MODE_PHONE / MOCK_MODE_EMAIL (see isMockModeForced below) are a
 * separate, explicit override on top of all that: set either to "true"
 * and that channel issues the fixed MOCK_OTP unconditionally, even
 * though a real provider IS configured -- for deliberately testing the
 * sign-in flow (including in a real production deployment) without
 * burning real SMS/email sends. This is intentionally independent of
 * isChannelConfigured()'s auto-detection -- flip it in Vercel's
 * Environment Variables (then redeploy) or in your local .env, and flip
 * it back the same way when you're done. Google sign-in has no
 * equivalent override -- it's untouched by this.
 *
 * OTP_ENABLED (see getOtpRateLimitConfig) is a separate, blunter switch
 * from MOCK_MODE_*: set it to "false" and NOTHING is issued at all, real
 * or mock, on either channel -- the emergency "stop everything right
 * now" lever for an active-abuse or runaway-SMS-cost incident, with no
 * deploy needed.
 */

export const MOCK_OTP = '433643';

export type OtpChannel = 'phone' | 'email';

/** The TS-facing 'phone' | 'email' union -> the Prisma-persisted enum, used only when writing an OtpCode row. */
function toDbChannel(channel: OtpChannel): DbOtpChannel {
  return channel === 'phone' ? 'PHONE' : 'EMAIL';
}

export function hashOtp(code: string) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

/**
 * Keeps one leading/trailing sliver visible and blanks the rest -- for
 * log lines only (see the SAFETY GUARD below's "never log OTP values"
 * discipline, which extends to never logging a full phone/email either).
 * Duplicated rather than imported from admin/lib/mask.ts or
 * components/AccountSecuritySection.tsx's inline version -- this app and
 * admin/ are separate Prisma Client instances with separate `@/*`
 * aliases (root lib/ isn't importable from admin/, and this is server
 * code that can't import a 'use client' component either), same
 * constraint noted throughout this codebase wherever root/admin need the
 * same small helper.
 */
function maskDestination(channel: OtpChannel, destination: string): string {
  if (channel === 'phone') {
    return destination.length > 4 ? `${destination.slice(0, -4).replace(/\d/g, '•')}${destination.slice(-4)}` : destination;
  }
  const [name, domain] = destination.split('@');
  if (!name || !domain) return '••••';
  return `${name.slice(0, 2)}${'•'.repeat(Math.max(name.length - 2, 1))}@${domain}`;
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
  return channel === 'phone' ? isSmsProviderConfigured() : isBrevoConfigured();
}

/**
 * Explicit, deliberate override: MOCK_MODE_PHONE="true" / MOCK_MODE_EMAIL="true"
 * force that channel's fixed MOCK_OTP regardless of isChannelConfigured() --
 * including when a real provider is fully configured and this is a real
 * production deployment. There's no equivalent for Google sign-in by
 * design (see this file's top doc comment).
 *
 * Anything other than exactly "true" (unset, "false", a typo) is
 * treated as off -- this never silently defaults to mock.
 */
export function isMockModeForced(channel: OtpChannel): boolean {
  const raw = channel === 'phone' ? process.env.MOCK_MODE_PHONE : process.env.MOCK_MODE_EMAIL;
  return raw === 'true';
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
 *
 * EXCEPT when isMockModeForced(channel) -- that's a deliberate, explicit
 * decision to run mock in production, so it bypasses this guard
 * entirely rather than being silently blocked by it (the whole point of
 * MOCK_MODE_PHONE/MOCK_MODE_EMAIL would otherwise do nothing on a
 * deployment whose real provider was never configured, which is exactly
 * the case this guard exists for).
 */
export function isMockOtpUnsafeInProduction(channel: OtpChannel): boolean {
  return !isChannelConfigured(channel) && isRealProductionDeployment() && !isMockModeForced(channel);
}

export type IssueOtpRateLimitDetail =
  | 'cooldown'
  | 'destination_hourly_limit'
  | 'destination_daily_limit'
  | 'ip_hourly_limit'
  | 'ip_daily_limit'
  | 'global_hourly_limit';

export type IssueOtpResult =
  | { ok: true }
  | { ok: false; reason: 'disabled' }
  | { ok: false; reason: 'rate_limited'; detail: IssueOtpRateLimitDetail; retryAfterSeconds?: number }
  | { ok: false; reason: 'provider_not_configured' }
  | { ok: false; reason: 'send_failed' };

export interface IssueOtpMeta {
  /** x-forwarded-for from the incoming request, or null if unavailable -- see lib/otpRateLimit.ts's clientIpFromRequest. */
  ip?: string | null;
  /** The findmyvybe_rlid anonymous correlation cookie's value, or null -- see lib/otpRateLimit.ts's getOrCreateRateLimitClientId. Recorded on the row for monitoring only; nothing currently rate-limits on it directly. */
  clientId?: string | null;
}

/**
 * Creates and stores a fresh OTP for a user, and -- when this channel's
 * real provider is configured (isChannelConfigured()) -- actually sends
 * it: a real random 6-digit code via MSG91/StartMessaging SMS or Brevo
 * email. When it isn't configured, this always issues the static
 * MOCK_OTP and never calls out to either provider, exactly like before
 * (see .env.example).
 *
 * Full check order -- see docs/OTP_SECURITY.md for the reasoning behind
 * each one:
 *  1. OTP_ENABLED kill switch (reason: 'disabled').
 *  2. The production safety guard above (reason: 'provider_not_configured').
 *  3. Per-destination/IP/global rate limits, cooldown (possibly
 *     progressive), and a soft daily cap for numbers that match a known
 *     test/bot pattern (reason: 'rate_limited', with `detail` saying
 *     which specific limit tripped -- logged for monitoring, but the
 *     caller's user-facing message collapses all the `detail` values
 *     down to "hourly" vs "daily" granularity, never naming IP/global/
 *     suspicious specifically, so a prober learns nothing about which
 *     layer actually caught them).
 *  4. Actually generating + storing + (for a real provider) sending the
 *     code (reason: 'send_failed' if the provider call itself throws).
 */
export async function issueOtp(
  userId: string,
  destination: string,
  channel: OtpChannel,
  purpose: OtpPurpose,
  meta: IssueOtpMeta = {},
): Promise<IssueOtpResult> {
  const config = getOtpRateLimitConfig();

  if (!config.enabled) {
    console.warn(`[otp] OTP_ENABLED=false -- refusing to issue a ${channel} code (purpose=${purpose}). Set OTP_ENABLED=true in Vercel to resume.`);
    return { ok: false, reason: 'disabled' };
  }

  if (isMockOtpUnsafeInProduction(channel)) {
    console.error(
      `[otp] SAFETY GUARD: no real ${channel} provider is configured on a production deployment ` +
        '(VERCEL_ENV=production) -- refusing to issue a code. The fixed mock code would otherwise ' +
        'authenticate as ANY phone number or email with zero real verification. Configure ' +
        `${channel === 'phone' ? 'StartMessaging or MSG91 (lib/notifications/sms.ts)' : 'Brevo (lib/notifications/email.ts)'} ` +
        'in Vercel (Production) -- see .env.example.',
    );
    return { ok: false, reason: 'provider_not_configured' };
  }

  const ip = meta.ip ?? null;
  const clientId = meta.clientId ?? null;
  const dbChannel = toDbChannel(channel);
  const maskedDestination = maskDestination(channel, destination);

  const now = Date.now();
  const hourAgo = new Date(now - 60 * 60 * 1000);
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const cooldownLookbackAgo = new Date(now - config.progressiveCooldownLookbackHours * 60 * 60 * 1000);

  const [destinationHour, destinationDay, recentForCooldown, mostRecent, ipHour, ipDay, globalHour, channelDailyVolume] =
    await Promise.all([
      db.otpCode.count({ where: { destination, channel: dbChannel, createdAt: { gte: hourAgo } } }),
      db.otpCode.count({ where: { destination, channel: dbChannel, createdAt: { gte: dayAgo } } }),
      db.otpCode.count({ where: { destination, channel: dbChannel, createdAt: { gte: cooldownLookbackAgo } } }),
      db.otpCode.findFirst({
        where: { destination, channel: dbChannel },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      ip ? db.otpCode.count({ where: { requestIp: ip, createdAt: { gte: hourAgo } } }) : Promise.resolve(null),
      ip ? db.otpCode.count({ where: { requestIp: ip, createdAt: { gte: dayAgo } } }) : Promise.resolve(null),
      config.maxGlobalPerHour !== null ? db.otpCode.count({ where: { createdAt: { gte: hourAgo } } }) : Promise.resolve(null),
      db.otpCode.count({ where: { channel: dbChannel, createdAt: { gte: dayAgo } } }),
    ]);

  // The cooldown itself (how long since the LAST request to this exact
  // destination) is checked separately from the hour/day volume caps
  // below -- it's about pacing back-to-back requests, not about a total
  // count, and it escalates on its own (progressive cooldown) rather
  // than being a fixed threshold.
  if (mostRecent) {
    const cooldownSeconds = config.progressiveCooldownEnabled
      ? computeProgressiveCooldownSeconds(config.resendCooldownSeconds, recentForCooldown, config.progressiveCooldownMaxSeconds)
      : config.resendCooldownSeconds;
    const elapsedSeconds = (now - mostRecent.createdAt.getTime()) / 1000;
    if (elapsedSeconds < cooldownSeconds) {
      return { ok: false, reason: 'rate_limited', detail: 'cooldown', retryAfterSeconds: Math.ceil(cooldownSeconds - elapsedSeconds) };
    }
  }

  // Suspicious-number soft mitigation: never a hard block (an unlucky
  // false positive still gets one code through today), just a much
  // tighter daily cap -- see lib/otpRateLimit.ts's isSuspiciousPhoneNumber
  // for exactly which patterns this catches and why it's deliberately
  // narrow.
  const suspicious = channel === 'phone' && isSuspiciousPhoneNumber(destination);
  if (suspicious) {
    console.warn(`[otp-abuse] suspicious phone pattern requested a code (purpose=${purpose}, ip=${ip ?? 'unknown'}) -- throttling to ${config.suspiciousNumberDailyLimit}/day instead of the normal limit.`);
  }

  const limits: OtpRequestLimits = {
    destinationPerHour: channel === 'phone' ? config.maxPerPhonePerHour : config.maxPerEmailPerHour,
    destinationPerDay: suspicious ? config.suspiciousNumberDailyLimit : channel === 'phone' ? config.maxPerPhonePerDay : config.maxPerEmailPerDay,
    ipPerHour: config.maxPerIpPerHour,
    ipPerDay: config.maxPerIpPerDay,
    globalPerHour: config.maxGlobalPerHour,
  };
  const counts: OtpRequestCounts = { destinationHour, destinationDay, ipHour, ipDay, globalHour };

  const decision = evaluateOtpRequestCounts(limits, counts);
  if (!decision.ok) {
    console.warn(`[otp-abuse] rate-limited a ${channel} request`, {
      detail: decision.reason,
      purpose,
      ip: ip ?? 'unknown',
      clientId: clientId ?? 'unknown',
      destination: maskedDestination,
    });
    return { ok: false, reason: 'rate_limited', detail: decision.reason };
  }

  const forced = isMockModeForced(channel);
  if (forced && isRealProductionDeployment()) {
    // Loud and visible in Vercel's logs on purpose -- this means ANY
    // phone number or email can sign in as itself using the fixed
    // MOCK_OTP on a real production deployment right now. Never meant
    // to be silent.
    console.warn(
      `[otp] MOCK MODE FORCED for ${channel} on a real production deployment -- ` +
        `issuing the fixed MOCK_OTP (${MOCK_OTP}) instead of a real code. ` +
        `Unset MOCK_MODE_${channel.toUpperCase()} in Vercel (and redeploy) to go back to real codes.`,
    );
  }
  const useRealProvider = isChannelConfigured(channel) && !forced;
  const code = useRealProvider ? crypto.randomInt(100000, 999999).toString() : MOCK_OTP;
  const otpTtlMinutes = Math.max(1, Math.round(config.expirySeconds / 60));

  await db.otpCode.create({
    data: {
      userId,
      codeHash: hashOtp(code),
      expiresAt: new Date(Date.now() + config.expirySeconds * 1000),
      destination,
      channel: dbChannel,
      purpose,
      requestIp: ip ?? undefined,
      clientId: clientId ?? undefined,
    },
  });

  if (useRealProvider) {
    try {
      if (channel === 'phone') {
        await sendOtpSms(destination, code, otpTtlMinutes);
      } else {
        await sendTransactionalEmail({
          to: destination,
          subject: `${code} is your findmyVybe verification code`,
          text: `Your findmyVybe verification code is ${code}. It expires in ${otpTtlMinutes} minutes.\n\nIf you didn't request this, you can safely ignore this email.`,
          html: `<p>Your findmyVybe verification code is <strong style="font-size:1.2em;letter-spacing:0.1em">${code}</strong>.</p><p>It expires in ${otpTtlMinutes} minutes.</p><p style="color:#666;font-size:0.9em">If you didn't request this, you can safely ignore this email.</p>`,
        });
      }
      // Rough provider-spend glance, not real billing -- see
      // docs/OTP_SECURITY.md §6. Neither StartMessaging, MSG91, nor
      // Brevo exposes a spend/usage API this app calls, so this counts
      // issued codes (real + mock) for the channel over the last 24h as
      // a stand-in, logged only every 50 to avoid spamming Vercel's
      // logs on a busy day.
      const approxTodayCount = channelDailyVolume + 1;
      if (approxTodayCount % 50 === 0) {
        if (channel === 'phone') {
          const costPerSms = Number(process.env.OTP_SMS_COST_INR_ESTIMATE || '0.25');
          console.log(`[otp-cost] ~${approxTodayCount} phone codes issued in the last 24h (~₹${(approxTodayCount * costPerSms).toFixed(2)} estimated at ₹${costPerSms}/SMS -- a rough glance, not real provider billing)`);
        } else {
          console.log(`[otp-cost] ~${approxTodayCount} email codes issued in the last 24h (Brevo's free tier is 300/day -- watch this if it's climbing)`);
        }
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

/**
 * Turns any non-ok IssueOtpResult into one friendly, generic message +
 * HTTP status for a route to return -- shared across all four call
 * sites (app/api/auth/request-otp, request-email-otp,
 * app/api/profile/phone|email/request-otp) so "what does this failure
 * mean to a user" is answered in exactly one place. Deliberately
 * collapses every rate_limited `detail` down to just "hourly" vs
 * "daily" phrasing -- never mentions IP/global/cooldown/suspicious
 * specifically, so a prober learns nothing about which layer actually
 * caught them (see issueOtp's doc comment).
 */
export function describeIssueOtpFailure(
  issued: Exclude<IssueOtpResult, { ok: true }>,
): { status: number; message: string; retryAfterSeconds?: number } {
  if (issued.reason === 'disabled') {
    return { status: 503, message: 'Verification is temporarily paused — please try again shortly.' };
  }
  if (issued.reason === 'provider_not_configured') {
    return { status: 503, message: 'Sign-in is temporarily unavailable — please try again shortly.' };
  }
  if (issued.reason === 'send_failed') {
    return { status: 502, message: "We couldn't send that code — please try again in a moment." };
  }
  // issued.reason === 'rate_limited'
  if (issued.detail === 'cooldown') {
    const wait = issued.retryAfterSeconds ?? 60;
    return {
      status: 429,
      message: `A code was already sent recently — wait ${wait}s before requesting another.`,
      retryAfterSeconds: wait,
    };
  }
  const isDaily = issued.detail.endsWith('daily_limit');
  return {
    status: 429,
    message: isDaily
      ? "You've requested too many codes today — please try again tomorrow."
      : 'Too many requests — please try again in a bit.',
  };
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
 * Once a row hits the configured max wrong guesses (lib/otpRateLimit.ts's
 * OTP_MAX_ATTEMPTS, default 10) it's permanently dead (checked before
 * comparing the new guess at all, so an eventual correct guess still
 * doesn't work) -- request a fresh code to get a fresh counter, subject
 * to issueOtp's cooldown and rate limits.
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

  const config = getOtpRateLimitConfig();

  const latest = await db.otpCode.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  if (!latest) return { ok: false, reason: 'not_found' };
  if (latest.consumedAt) return { ok: false, reason: 'already_used' };
  if (latest.attempts >= config.maxAttempts) return { ok: false, reason: 'too_many_attempts' };
  if (latest.expiresAt.getTime() <= Date.now()) return { ok: false, reason: 'expired' };

  if (latest.codeHash !== hashOtp(code)) {
    const attempts = await db.otpCode.update({
      where: { id: latest.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });
    if (attempts.attempts >= config.maxAttempts) {
      console.warn(`[otp-abuse] ${channel} code for user ${userId} hit the max-attempts cap -- a fresh code is required now.`);
    }
    return { ok: false, reason: 'mismatch' };
  }

  await db.otpCode.update({ where: { id: latest.id }, data: { consumedAt: new Date() } });
  return { ok: true };
}
