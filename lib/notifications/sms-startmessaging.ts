/**
 * OTP SMS via StartMessaging -- one of two interchangeable SMS providers
 * this app supports (see lib/notifications/sms.ts, the facade that picks
 * between this and sms-msg91.ts). Unlike MSG91, StartMessaging routes
 * through its OWN pre-registered DLT entity and a shared sender ID
 * (something like "STARTM", not a branded one) -- so there's no TRAI
 * Principal Entity / header / template registration to do yourself
 * first, just an account and an API key, live in minutes instead of
 * 24-48h+. The tradeoff is a flat ~Rs 0.25/OTP instead of MSG91's
 * volume-discounted ~Rs 0.13-0.24, and a generic rather than branded
 * sender ID. Back-of-envelope: StartMessaging is cheaper below roughly
 * 200-250k lifetime OTPs (no ~Rs 11,800 DLT setup cost to amortize);
 * MSG91 wins past that, once real launch volume justifies the DLT
 * paperwork. REST API (https://api.startmessaging.com/otp/send) -- no
 * SDK dependency.
 *
 * SETUP (the part that can't happen from this codebase): create an
 * account at startmessaging.com and grab an API key (looks like
 * "sm_live_...") from the dashboard. Set STARTMESSAGING_API_KEY.
 *
 * DELIBERATE DESIGN CHOICE, same as sms-msg91.ts: this app generates,
 * hashes and stores/verifies its own OTP in lib/otp.ts -- StartMessaging
 * is meant to be used purely as an SMS *transport* for that code (the
 * `variables.otp` field below), not as its own system of record, so the
 * one cooldown/attempt-cap/expiry implementation in lib/otp.ts stays
 * authoritative for every channel.
 *
 * NOT YET LIVE-TESTED -- VERIFY BEFORE RELYING ON THIS IN PRODUCTION:
 * StartMessaging's own API reference (startmessaging.com/otp-api)
 * documents this exact shape -- POST /otp/send with a `variables` object
 * containing `otp`, your own pre-generated code, as an explicit override
 * of StartMessaging's default behavior. But a couple of StartMessaging's
 * own tutorial examples call /otp/send with ONLY a phone number and no
 * `variables` at all, then verify later via a separate /otp/verify +
 * requestId flow with a StartMessaging-generated code -- a materially
 * different integration shape (a fully provider-managed OTP lifecycle,
 * which would NOT fit this app's design above). That inconsistency
 * couldn't be resolved from documentation alone. Before flipping this on
 * for real users: set STARTMESSAGING_API_KEY, trigger one real sign-in
 * on a test phone number, and confirm the SMS that arrives contains the
 * EXACT code lib/otp.ts generated (check the OtpCode row or a temporary
 * console.log of `code` in issueOtp) -- not some other code
 * StartMessaging generated on its own. If it doesn't match, the
 * `variables.otp` override isn't actually honored and this file needs a
 * different approach (e.g. switching to their managed verify flow, which
 * would mean a larger change to lib/otp.ts, not just this file).
 */

export function isStartMessagingConfigured(): boolean {
  return Boolean(process.env.STARTMESSAGING_API_KEY);
}

export class StartMessagingSendError extends Error {}

/**
 * Sends `otp` to `phoneE164` (e.g. "+919876543210") via StartMessaging's
 * OTP API, passing it as the pre-generated code to deliver rather than
 * letting StartMessaging generate its own (see the NOT YET LIVE-TESTED
 * note above). `otpExpiryMinutes` isn't sent -- StartMessaging's
 * documented request body has no expiry field, since the app's own
 * expiry (lib/otp.ts's OtpCode row) is what actually gates verification;
 * kept as a parameter only so this function's signature matches
 * sms-msg91.ts's sendOtpSmsViaMsg91 for the facade to call either one
 * interchangeably. Throws StartMessagingSendError on any non-2xx
 * response, a non-success response body, or a network failure.
 */
export async function sendOtpSmsViaStartMessaging(
  phoneE164: string,
  otp: string,
  otpExpiryMinutes: number,
): Promise<void> {
  void otpExpiryMinutes;
  const apiKey = process.env.STARTMESSAGING_API_KEY;
  if (!apiKey) {
    throw new StartMessagingSendError('StartMessaging is not configured (STARTMESSAGING_API_KEY missing).');
  }

  const res = await fetch('https://api.startmessaging.com/otp/send', {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      phoneNumber: phoneE164,
      variables: { otp },
    }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || json?.success !== true) {
    throw new StartMessagingSendError(`StartMessaging send failed (${res.status}): ${JSON.stringify(json)}`);
  }
}
