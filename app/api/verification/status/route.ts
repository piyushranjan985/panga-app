import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

/**
 * Lets the client poll for the outcome of an in-flight verification --
 * needed now that verification can resolve async via a DigiLocker
 * redirect round trip rather than only a same-tab timer. Returns the
 * latest IdentityVerification attempt's status/failureReason alongside
 * the authoritative Profile.verification (the field
 * lib/accountEnforcement.ts actually gates on).
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const [profile, latestAttempt] = await Promise.all([
    db.profile.findUnique({ where: { userId: session.userId }, select: { verification: true } }),
    db.identityVerification.findFirst({
      where: { userId: session.userId },
      orderBy: { submittedAt: 'desc' },
      select: { status: true, failureReason: true, submittedAt: true, decidedAt: true },
    }),
  ]);

  if (!profile) return NextResponse.json({ error: 'Finish onboarding first.' }, { status: 400 });

  return NextResponse.json({
    verification: profile.verification,
    latestAttempt: latestAttempt ?? null,
  });
}
