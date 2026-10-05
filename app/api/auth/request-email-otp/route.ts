import { NextResponse } from 'next/server';
import { z } from 'zod';
import { OtpPurpose } from '@prisma/client';
import { db } from '@/lib/db';
import { issueOtp, describeIssueOtpFailure } from '@/lib/otp';
import { clientIpFromRequest } from '@/lib/otpRateLimit';
import { getOrCreateRateLimitClientId } from '@/lib/rateLimitClientId';

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
});

/**
 * Email twin of /api/auth/request-otp -- SIGN-IN only, not sign-up. See
 * docs/PHONE_FIRST_AUTH.md §2: phone is findmyVybe's mandatory account-
 * creation gate now (the stronger anti-fake-account signal), so this
 * route no longer auto-creates a user for an email with no existing
 * account the way it -- and /api/auth/request-otp, deliberately
 * unchanged -- both used to. An email that DOES already have an account
 * (grandfathered pre-existing email/Google sign-ups, or an email added
 * later from Profile) still signs in exactly as before.
 */
export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid email' }, { status: 400 });
  }
  const { email } = parsed.data;

  const user = await db.user.findUnique({ where: { email }, include: { profile: true } });
  if (!user) {
    return NextResponse.json(
      { error: "No account found for that email yet — sign up with your phone number first, then add email from your profile." },
      { status: 404 },
    );
  }
  const alreadyHasProfile = Boolean(user.profile);

  const ip = clientIpFromRequest(req);
  const clientId = await getOrCreateRateLimitClientId();

  const issued = await issueOtp(user.id, email, 'email', OtpPurpose.LOGIN, { ip, clientId });
  if (!issued.ok) {
    const { status, message, retryAfterSeconds } = describeIssueOtpFailure(issued);
    const headers = retryAfterSeconds ? { 'Retry-After': String(retryAfterSeconds) } : undefined;
    return NextResponse.json({ error: message }, { status, headers });
  }

  return NextResponse.json({ ok: true, alreadyHasProfile });
}
