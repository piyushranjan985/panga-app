import { NextResponse } from 'next/server';
import { z } from 'zod';
import { OtpPurpose } from '@prisma/client';
import { db } from '@/lib/db';
import { issueOtp, describeIssueOtpFailure } from '@/lib/otp';
import { clientIpFromRequest } from '@/lib/otpRateLimit';
import { getOrCreateRateLimitClientId } from '@/lib/rateLimitClientId';

const bodySchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^\+91[6-9]\d{9}$/, 'Enter a valid Indian mobile number, e.g. +919876543210'),
});

/**
 * Requests an OTP for a phone number. See lib/otp.ts for how the code
 * itself is generated/mocked and the request-side cooldown/rate limits,
 * and docs/OTP_SECURITY.md for the abuse-protection design overall. OTP
 * request/verify doubles as both sign-up and sign-in (hasProfile/
 * hasAccount decides the follow-on message, not a separate endpoint) --
 * see app/verify/page.tsx routing.
 */
export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid phone number' }, { status: 400 });
  }
  const { phone } = parsed.data;

  // Look the number up before creating anything -- lets the client tell
  // someone "welcome back, you already have an account" instead of
  // silently treating every phone number the same way (a deliberate
  // product choice over strict anti-enumeration, revisited and kept as
  // part of the OTP security hardening pass -- see
  // docs/OTP_SECURITY.md §2). Also doubles as this request's SIGNUP vs
  // LOGIN purpose for rate-limit monitoring.
  const existing = await db.user.findUnique({ where: { phone }, include: { profile: true } });
  const user = existing ?? (await db.user.create({ data: { phone } }));
  const alreadyHasProfile = Boolean(existing?.profile);
  const purpose = existing ? OtpPurpose.LOGIN : OtpPurpose.SIGNUP;

  const ip = clientIpFromRequest(req);
  const clientId = await getOrCreateRateLimitClientId();

  const issued = await issueOtp(user.id, phone, 'phone', purpose, { ip, clientId });
  if (!issued.ok) {
    const { status, message, retryAfterSeconds } = describeIssueOtpFailure(issued);
    const headers = retryAfterSeconds ? { 'Retry-After': String(retryAfterSeconds) } : undefined;
    return NextResponse.json({ error: message }, { status, headers });
  }

  return NextResponse.json({ ok: true, alreadyHasProfile });
}
