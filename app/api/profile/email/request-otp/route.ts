import { NextResponse } from 'next/server';
import { z } from 'zod';
import { OtpPurpose } from '@prisma/client';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { issueOtp, describeIssueOtpFailure } from '@/lib/otp';
import { clientIpFromRequest } from '@/lib/otpRateLimit';
import { getOrCreateRateLimitClientId } from '@/lib/rateLimitClientId';

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
});

/**
 * "Add & verify email" from an authenticated context -- the Profile-
 * settings half of findmyVybe's "phone first, email later" flow (see
 * docs/PHONE_FIRST_AUTH.md). Same relationship to /api/auth/request-
 * email-otp as app/api/profile/phone/request-otp/route.ts has to
 * /api/auth/request-otp: that one is sign-in-by-email (and, since the
 * phone-first change, only for an email that already has an account);
 * this one always attaches to the CURRENT session's user.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid email' }, { status: 400 });
  }
  const { email } = parsed.data;

  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing && existing.id !== session.userId) {
    return NextResponse.json({ error: 'That email is already linked to a different account.' }, { status: 409 });
  }

  const ip = clientIpFromRequest(req);
  const clientId = await getOrCreateRateLimitClientId();

  const issued = await issueOtp(session.userId, email, 'email', OtpPurpose.EMAIL_CHANGE, { ip, clientId });
  if (!issued.ok) {
    const { status, message, retryAfterSeconds } = describeIssueOtpFailure(issued);
    const headers = retryAfterSeconds ? { 'Retry-After': String(retryAfterSeconds) } : undefined;
    return NextResponse.json({ error: message }, { status, headers });
  }

  return NextResponse.json({ ok: true });
}
