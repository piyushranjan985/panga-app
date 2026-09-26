import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import {
  getVerificationProviderName,
  isDigilockerConfigured,
  signVerificationState,
  buildDigilockerAuthorizationUrl,
  mockFetchIdentityDocument,
  finalizeIdentityVerification,
  type MockScenario,
} from '@/lib/safety/identityVerification';

/**
 * Starts identity verification (docs/IDENTITY_VERIFICATION_AND_SAFETY.md
 * section 2). Two branches:
 *
 *  - VERIFICATION_PROVIDER=digilocker: hands back a DigiLocker
 *    authorization URL for the client to redirect the user to. The real
 *    decision happens in app/api/verification/callback/route.ts when
 *    DigiLocker redirects back with a code.
 *  - VERIFICATION_PROVIDER=mock (default): same shape of end state
 *    without leaving the app -- flips to PENDING immediately, then
 *    resolves a few seconds later via the same finalizeIdentityVerification
 *    logic the real callback uses (duplicate check, DOB check, audit
 *    row, ModerationCase on anything short of VERIFIED). This is how the
 *    whole verification state machine is testable today, before any real
 *    DigiLocker credentials exist.
 *
 * A mock request may pass ?scenario=match|dob_mismatch|duplicate to
 * exercise a specific outcome -- see identityVerification.ts's
 * MockScenario doc comment. Ignored entirely when provider=digilocker.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.userId }, select: { verification: true } });
  if (!profile) return NextResponse.json({ error: 'Finish onboarding first.' }, { status: 400 });
  if (profile.verification === 'VERIFIED') {
    return NextResponse.json({ ok: true, status: 'VERIFIED' });
  }

  const provider = getVerificationProviderName();

  if (provider === 'digilocker') {
    if (!isDigilockerConfigured()) {
      // Deploy-time misconfiguration, not a user-facing state -- fail
      // loudly rather than silently degrading to mock, so a real
      // production deploy never quietly issues fake verifications.
      return NextResponse.json(
        { error: 'DigiLocker is not configured (DIGILOCKER_CLIENT_ID/SECRET missing). See .env.example.' },
        { status: 500 },
      );
    }
    await db.profile.update({ where: { userId: session.userId }, data: { verification: 'PENDING' } });
    const state = await signVerificationState(session.userId);
    const authorizationUrl = buildDigilockerAuthorizationUrl(state);
    return NextResponse.json({ ok: true, status: 'PENDING', authorizationUrl });
  }

  // --- Mock mode ---
  await db.profile.update({ where: { userId: session.userId }, data: { verification: 'PENDING' } });

  const scenarioParam = req.nextUrl.searchParams.get('scenario');
  const scenario: MockScenario =
    scenarioParam === 'dob_mismatch' || scenarioParam === 'duplicate' ? scenarioParam : 'match';

  // Simulates an async KYC round trip. A real integration returns
  // immediately (see the digilocker branch above) and resolves from the
  // callback redirect instead of a timer.
  setTimeout(async () => {
    try {
      const document = await mockFetchIdentityDocument(session.userId, scenario);
      await finalizeIdentityVerification({ userId: session.userId, provider: 'mock', document });
    } catch (err) {
      console.error('[verification/start] mock finalize failed', err);
    }
  }, 4000);

  return NextResponse.json({ ok: true, status: 'PENDING' });
}
