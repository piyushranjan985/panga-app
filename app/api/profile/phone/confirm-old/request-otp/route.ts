import { NextResponse } from 'next/server';
import { OtpPurpose } from '@prisma/client';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { issueOtp, describeIssueOtpFailure } from '@/lib/otp';
import { clientIpFromRequest } from '@/lib/otpRateLimit';
import { getOrCreateRateLimitClientId } from '@/lib/rateLimitClientId';

/**
 * Step 1 of changing an already-verified phone: prove you still control
 * something this account already trusts before you're even allowed to
 * request a code for a new number. See ../../request-otp/route.ts's
 * doc comment for why this gate exists and lib/otp.ts's
 * hasRecentConfirmedOtp for how completing this unlocks that route.
 *
 * Prefers the verified EMAIL on file over the phone itself: an
 * independent channel from the one being changed is the stronger
 * check -- it isn't defeated by whatever compromised the phone number
 * in the first place (a SIM swap, a stolen unlocked device with SMS
 * previews on) -- and only falls back to the OLD phone's own OTP for a
 * phone-only account with no verified email to use instead. No request
 * body either way -- the destination is always derived from the
 * account's own current verified values, never caller-supplied.
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

  const useEmail = Boolean(user.email && user.emailVerified);
  const destination = useEmail ? (user.email as string) : user.phone;
  const channel = useEmail ? 'email' : 'phone';

  const ip = clientIpFromRequest(req);
  const clientId = await getOrCreateRateLimitClientId();

  const issued = await issueOtp(session.userId, destination, channel, OtpPurpose.PHONE_CHANGE, { ip, clientId });
  if (!issued.ok) {
    const { status, message, retryAfterSeconds } = describeIssueOtpFailure(issued);
    const headers = retryAfterSeconds ? { 'Retry-After': String(retryAfterSeconds) } : undefined;
    return NextResponse.json({ error: message }, { status, headers });
  }

  return NextResponse.json({ ok: true, maskedDestination: issued.maskedDestination, channel });
}
