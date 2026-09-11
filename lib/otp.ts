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

/** Returns true and consumes the code if it's valid; false otherwise. */
export async function consumeOtp(userId: string, code: string) {
  const codeHash = hashOtp(code);
  const otp = await db.otpCode.findFirst({
    where: { userId, codeHash, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp) return false;

  await db.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
  return true;
}
