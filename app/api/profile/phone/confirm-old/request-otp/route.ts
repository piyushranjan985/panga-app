import { NextResponse } from 'next/server';
import { OtpPurpose } from '@prisma/client';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { issueOtp, describeIssueOtpFailure } from '@/lib/otp';
import { clientIpFromRequest } from '@/lib/otpRateLimit';
import { getOrCreateRateLimitClientId } from '@/lib/rateLimitClientId';

/**
 * Step 1 of changing an already-verified phone: prove you still control
 * the account's verified EMAIL before you're even allowed to request a
 * code for a new number. See ../../request-otp/route.ts's doc comment
 * for why this gate exists and lib/otp.ts's hasRecentConfirmedOtp for
 * how completing this unlocks that route.
 *
 * Deliberately EMAIL, not the old phone itself: an independent channel
 * from the one being changed is the stronger check -- it isn't
 * defeated by whatever compromised the phone number in the first place
 * (a SIM swap, a stolen unlocked device with SMS previews on).
 *
 * Requires a verified email on file, full stop -- no fallback to the
 * phone's own OTP for a phone-only account. That's a deliberate
 * simplification: every phone-only grandfathered account gets cleared
 * out before launch (see docs/PHONE_FIRST_AUTH.md), so this isn't a
 * real case worth a second code path for. No request body -- the
 * destination is always the account's own current verified email,
 * never caller-supplied.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { phone: true, phoneVerified: true, email: true, emailVerified: true },
  });
  if (!user?.phone || !user.phoneVerified) {
    return NextResponse.json({ error: "You don't have a verified phone to confirm yet." }, { status: 400 });
  }
  if (!user.email || !user.emailVerified) {
    return NextResponse.json({ error: 'Add a verified email first, then you can change your phone number.' }, { status: 400 });
  }

  const ip = clientIpFromRequest(req);
  const clientId = await getOrCreateRateLimitClientId();

  const issued = await issueOtp(session.userId, user.email, 'email', OtpPurpose.PHONE_CHANGE, { ip, clientId });
  if (!issued.ok) {
    const { status, message, retryAfterSeconds } = describeIssueOtpFailure(issued);
    const headers = retryAfterSeconds ? { 'Retry-After': String(retryAfterSeconds) } : undefined;
    return NextResponse.json({ error: message }, { status, headers });
  }

  return NextResponse.json({ ok: true, maskedDestination: issued.maskedDestination });
}
