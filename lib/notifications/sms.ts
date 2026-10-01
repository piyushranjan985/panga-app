/**
 * OTP SMS via MSG91 -- already the provider named in this project's
 * .env.example before this file existed, and the right default for an
 * India-only phone number base: it's an Indian company built around
 * TRAI's DLT (Distributed Ledger Technology) routing, so sending to a
 * +91 number works the way Twilio/AWS SNS/Firebase generally don't
 * without a lot of extra, India-specific setup on top (see this app's
 * launch-readiness notes). REST API, v5 OTP endpoint
 * (https://control.msg91.com/api/v5/otp) -- no SDK dependency.
 *
 * SETUP (the part that can't happen from this codebase): create an
 * MSG91 account, register as a DLT Principal Entity + sender header on
 * the operator DLT portals (MSG91's own onboarding walks through this --
 * it's a real-world KYC process, not an API call, typically 24-48h for
 * template approval once the entity itself is registered), then create
 * an OTP template there -- its approved text must contain MSG91's OTP
 * variable placeholder, since DLT requires the exact approved wording
 * and this integration never sends freeform SMS text. MSG91_TEMPLATE_ID
 * is that template's id; MSG91_AUTH_KEY is under Settings > API in the
 * MSG91 dashboard. Until both are set, lib/otp.ts's isChannelConfigured('phone')
 * returns false and the mock code stays in use (see isMockOtpUnsafeInProduction
 * there for what that means in real production).
 *
 * DELIBERATE DESIGN CHOICE: this app generates and hashes its own OTP
 * (lib/otp.ts, same code either way, mock or real) and stores/verifies it
 * itself -- MSG91 is used purely as an SMS *transport* for that code (the
 * `otp` query param below overrides MSG91's own default of generating its
 * own), not as the system of record for whether a code is valid. That
 * keeps the one cooldown/attempt-cap/expiry implementation in lib/otp.ts
 * authoritative for both channels, rather than splitting "is this code
 * right" between this app's DB and MSG91's own /otp/verify endpoint.
 */

export function isMsg91Configured(): boolean {
  return Boolean(process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID);
}

export class SmsSendError extends Error {}

/**
 * Sends `otp` to `phoneE164` (e.g. "+919876543210") via MSG91's v5 OTP
 * API. MSG91 wants the number in international format WITHOUT the
 * leading "+" (e.g. "919876543210") -- stripped here so every caller can
 * keep using this app's own +91-prefixed phone format (see
 * app/api/auth/request-otp/route.ts's validation regex) everywhere else.
 * Throws SmsSendError on any non-2xx response, a non-"success" MSG91
 * response body, or a network failure.
 */
export async function sendOtpSms(phoneE164: string, otp: string, otpExpiryMinutes: number): Promise<void> {
  const authkey = process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_TEMPLATE_ID;
  if (!authkey || !templateId) {
    throw new SmsSendError('MSG91 is not configured (MSG91_AUTH_KEY / MSG91_TEMPLATE_ID missing).');
  }

  const url = new URL('https://control.msg91.com/api/v5/otp');
  url.searchParams.set('template_id', templateId);
  url.searchParams.set('mobile', phoneE164.replace(/^\+/, ''));
  url.searchParams.set('otp', otp);
  url.searchParams.set('otp_expiry', String(otpExpiryMinutes));

  const res = await fetch(url, {
    method: 'POST',
    headers: { authkey, 'content-type': 'application/json' },
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || json?.type !== 'success') {
    throw new SmsSendError(`MSG91 send failed (${res.status}): ${JSON.stringify(json)}`);
  }
}
