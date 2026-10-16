import { NextResponse } from 'next/server';
import { OtpPurpose } from '@prisma/client';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { issueOtp, describeIssueOtpFailure } from '@/lib/otp';
import { clientIpFromRequest } from '@/lib/otpRateLimit';
import { getOrCreateRateLimitClientId } from '@/lib/rateLimitClientId';

/**
 * Step 1 of changing an already-verified email: prove you still control
 * the CURRENT one before you're even allowed to request a code for a
 * new one. See ../../request-otp/route.ts's doc comment for why this
 * gate exists (a stolen session cookie alone must not be enough to
 * swap a verified email) and lib/otp.ts's hasRecentConfirmedOtp for how
 * completing this unlocks that route.
 *
 * No request body -- the destination is always the account's own
 * current verified email, never something the caller supplies (that's
 * the whole point: it has to be the value this account already
 * trusts, not one the caller gets to pick).
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { email: true, emailVerified: true },
  });
  if (!user?.email || !user.emailVerified) {
    return NextResponse.json({ error: "You don't have a verified email to confirm yet." }, { status: 400 });
  }

  const ip = clientIpFromRequest(req);
  const clientId = await getOrCreateRateLimitClientId();

  const issued = await issueOtp(session.userId, user.email, 'email', OtpPurpose.EMAIL_CHANGE, { ip, clientId });
  if (!issued.ok) {
    const { status, message, retryAfterSeconds } = describeIssueOtpFailure(issued);
    const headers = retryAfterSeconds ? { 'Retry-After': String(retryAfterSeconds) } : undefined;
    return NextResponse.json({ error: message }, { status, headers });
  }

  return NextResponse.json({ ok: true, maskedDestination: issued.maskedDestination });
}
