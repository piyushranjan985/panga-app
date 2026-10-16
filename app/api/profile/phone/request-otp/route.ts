import { NextResponse } from 'next/server';
import { z } from 'zod';
import { OtpPurpose } from '@prisma/client';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { issueOtp, describeIssueOtpFailure, hasRecentConfirmedOtp, CONFIRM_OLD_WINDOW_MINUTES } from '@/lib/otp';
import { clientIpFromRequest } from '@/lib/otpRateLimit';
import { getOrCreateRateLimitClientId } from '@/lib/rateLimitClientId';

const bodySchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^\+91[6-9]\d{9}$/, 'Enter a valid Indian mobile number, e.g. +919876543210'),
});

/**
 * "Add & verify phone" from an authenticated context -- see
 * docs/PHONE_FIRST_AUTH.md. Used two ways: the mandatory /verify-phone
 * gate (a Google/Apple sign-up with no phone yet, no profile yet) and
 * the optional "Add phone" section in Profile settings (a grandfathered
 * phone-less account that already has a profile). Deliberately NOT the
 * same route as /api/auth/request-otp -- that one looks up or creates a
 * user BY phone number (the sign-in/sign-up shape); this one always
 * attaches to the CURRENT session's user, and refuses when the number
 * already belongs to someone else instead of silently switching accounts.
 *
 * A genuine CHANGE (an already-verified phone being replaced, not a
 * first-time add) additionally requires ./confirm-old/*.ts to have been
 * completed in the last CONFIRM_OLD_WINDOW_MINUTES -- see
 * hasRecentConfirmedOtp's doc comment in lib/otp.ts. This is a
 * server-side gate, not just a UI sequencing choice: without it, anyone
 * who merely has the session cookie (e.g. a stolen one) could call this
 * endpoint directly and swap the number with nothing but a code sent to
 * a destination THEY chose. A first-time add (no previous verified
 * phone) skips this entirely -- there's nothing to confirm yet.
 *
 * The confirm-old destination is always the account's verified EMAIL
 * (see ./confirm-old/request-otp/route.ts) -- a phone-only account with
 * no verified email can't clear this gate at all, by design: every
 * phone-only grandfathered account gets cleared out before launch (see
 * docs/PHONE_FIRST_AUTH.md), so this isn't worth a fallback code path.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid phone number' }, { status: 400 });
  }
  const { phone } = parsed.data;

  const [existing, currentUser] = await Promise.all([
    db.user.findUnique({ where: { phone }, select: { id: true } }),
    db.user.findUnique({
      where: { id: session.userId },
      select: { phone: true, phoneVerified: true, email: true, emailVerified: true },
    }),
  ]);
  if (existing && existing.id !== session.userId) {
    return NextResponse.json({ error: "That number's already linked to a different account." }, { status: 409 });
  }

  const isChange = Boolean(currentUser?.phone && currentUser.phoneVerified && currentUser.phone !== phone);
  if (isChange) {
    if (!currentUser?.email || !currentUser.emailVerified) {
      return NextResponse.json(
        { error: 'Add a verified email first, then you can change your phone number.' },
        { status: 400 },
      );
    }
    const confirmed = await hasRecentConfirmedOtp(session.userId, currentUser.email, CONFIRM_OLD_WINDOW_MINUTES);
    if (!confirmed) {
      return NextResponse.json(
        { error: 'Please confirm your current email first.', code: 'CONFIRM_OLD_REQUIRED' },
        { status: 403 },
      );
    }
  }

  const ip = clientIpFromRequest(req);
  const clientId = await getOrCreateRateLimitClientId();

  const issued = await issueOtp(session.userId, phone, 'phone', OtpPurpose.PHONE_CHANGE, { ip, clientId });
  if (!issued.ok) {
    const { status, message, retryAfterSeconds } = describeIssueOtpFailure(issued);
    const headers = retryAfterSeconds ? { 'Retry-After': String(retryAfterSeconds) } : undefined;
    return NextResponse.json({ error: message }, { status, headers });
  }

  return NextResponse.json({ ok: true });
}
