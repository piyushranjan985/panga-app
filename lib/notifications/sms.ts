/**
 * Facade over this app's two interchangeable SMS/OTP providers --
 * sms-startmessaging.ts (no DLT paperwork, flat ~Rs 0.25/OTP, live in
 * minutes) and sms-msg91.ts (requires your own DLT registration, lower
 * per-OTP cost at volume) -- so lib/otp.ts only ever calls
 * isSmsProviderConfigured()/sendOtpSms() and never needs to know or care
 * which one is actually wired up. Swapping providers (e.g. launching on
 * StartMessaging now, moving to MSG91 once volume justifies the DLT
 * setup cost) is purely an env-var change here, not a code change in
 * lib/otp.ts.
 *
 * Provider selection: an explicit SMS_PROVIDER env var ("startmessaging"
 * or "msg91") wins when set and that provider's own credentials are
 * present; otherwise this auto-detects, preferring StartMessaging when
 * both happen to be configured (it's the faster, no-DLT-wait path for
 * getting live) and falling back to MSG91. See each provider file's
 * module doc for setup instructions and the cost/tradeoff comparison.
 */

import { isMsg91Configured, sendOtpSmsViaMsg91 } from './sms-msg91';
import { isStartMessagingConfigured, sendOtpSmsViaStartMessaging } from './sms-startmessaging';

export { isMsg91Configured, isStartMessagingConfigured };

export type SmsProviderName = 'startmessaging' | 'msg91';

function resolveSmsProvider(): SmsProviderName | null {
  const explicit = process.env.SMS_PROVIDER?.trim().toLowerCase();

  if (explicit === 'msg91' || explicit === 'startmessaging') {
    const configured = explicit === 'msg91' ? isMsg91Configured() : isStartMessagingConfigured();
    return configured ? explicit : null;
  }
  if (explicit) {
    console.error(
      `[sms] SMS_PROVIDER="${explicit}" isn't a recognized provider (expected "startmessaging" or ` +
        '"msg91") -- ignoring it and auto-detecting from whichever credentials are present instead.',
    );
  }

  if (isStartMessagingConfigured()) return 'startmessaging';
  if (isMsg91Configured()) return 'msg91';
  return null;
}

/** True when at least one SMS provider (StartMessaging or MSG91) has real credentials configured. */
export function isSmsProviderConfigured(): boolean {
  return resolveSmsProvider() !== null;
}

export class SmsSendError extends Error {}

/**
 * Sends `otp` to `phoneE164` via whichever SMS provider resolveSmsProvider()
 * picks. Throws SmsSendError if no provider is configured at all (callers
 * should check isSmsProviderConfigured() first -- lib/otp.ts does, via
 * isChannelConfigured('phone')); otherwise propagates that provider's own
 * error (Msg91SendError / StartMessagingSendError) on a failed send.
 */
export async function sendOtpSms(phoneE164: string, otp: string, otpExpiryMinutes: number): Promise<void> {
  const provider = resolveSmsProvider();
  if (provider === 'startmessaging') {
    return sendOtpSmsViaStartMessaging(phoneE164, otp, otpExpiryMinutes);
  }
  if (provider === 'msg91') {
    return sendOtpSmsViaMsg91(phoneE164, otp, otpExpiryMinutes);
  }
  throw new SmsSendError('No SMS provider is configured -- set STARTMESSAGING_API_KEY or MSG91_AUTH_KEY/MSG91_TEMPLATE_ID.');
}
