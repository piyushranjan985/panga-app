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
 * A mock request may pass
 * ?scenario=match|dob_mismatch|duplicate|underage|name_mismatch to
 * exercise a specific outcome -- see identityVerification.ts's
 * MockScenario doc comment and decideVerificationOutcome()'s ordered
 * rule list. Ignored entirely when provider=digilocker.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.userId }, select: { verification: true } });
  if (!profile) return NextResponse.json({ error: 'Finish onboarding first.' }, { status: 400 });
  if (profile.verification === 'VERIFIED') {
    return NextResponse.json({ ok: true, status: 'VERIFIED' });
  }

  // A confirmed-underage REJECTED is the one outcome with no self-service
  // retry path (see decideVerificationOutcome()'s doc comment and
  // docs/IDENTITY_VERIFICATION_AND_SAFETY.md section 6) -- their real
  // document's DOB won't change on a retry anyway, but resubmitting
  // should surface as needing a human's attention (an admin clearing it
  // via users.action.resetVerification), not a quiet "try again" that
  // looks like any other rejection.
  if (profile.verification === 'REJECTED') {
    const latestAttempt = await db.identityVerification.findFirst({
      where: { userId: session.userId },
      orderBy: { submittedAt: 'desc' },
      select: { failureReason: true },
    });
    if (latestAttempt?.failureReason === 'underage') {
      return NextResponse.json(
        { error: 'This account needs admin review before verification can be retried. Contact support.' },
        { status: 403 },
      );
    }
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
  const KNOWN_SCENARIOS: MockScenario[] = ['dob_mismatch', 'duplicate', 'underage', 'name_mismatch'];
  const scenario: MockScenario = (KNOWN_SCENARIOS as string[]).includes(scenarioParam ?? '')
    ? (scenarioParam as MockScenario)
    : 'match';

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
