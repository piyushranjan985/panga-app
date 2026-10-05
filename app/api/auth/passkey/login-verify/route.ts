import { NextResponse } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { db } from '@/lib/db';
import { createSession } from '@/lib/session';
import { issueTrustedDevice } from '@/lib/trustedDevice';
import { nextPathAfterAuth } from '@/lib/auth/postAuthRedirect';
import { webauthnRpID, webauthnExpectedOrigins } from '@/lib/webauthn';
import { consumeWebauthnChallenge } from '@/lib/auth/webauthnChallenge';
import { DELETED_ACCOUNT_MESSAGE } from '@/lib/accountEnforcement';

/**
 * Step 2 of "Sign in with a passkey". response.id (the credential id the
 * browser used) is how the account is found at all -- a passkey can
 * only ever have been registered by someone already signed in some
 * other way (see app/api/profile/passkey/register-verify/route.ts), so
 * this never creates a new account, only signs into an existing one.
 */
export async function POST(req: Request) {
  const expectedChallenge = await consumeWebauthnChallenge();
  if (!expectedChallenge) {
    return NextResponse.json({ error: 'That sign-in attempt expired -- try again.' }, { status: 400 });
  }

  const response = await req.json().catch(() => null);
  const credentialId: unknown = response?.id;
  if (!response || typeof credentialId !== 'string') {
    return NextResponse.json({ error: 'Invalid passkey response.' }, { status: 400 });
  }

  const stored = await db.webAuthnCredential.findUnique({ where: { credentialId } });
  if (!stored) {
    return NextResponse.json({ error: "We don't recognize that passkey -- try phone or email instead." }, { status: 404 });
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: webauthnExpectedOrigins(),
      expectedRPID: webauthnRpID(),
      credential: { id: stored.credentialId, publicKey: stored.publicKey, counter: stored.counter, transports: stored.transports },
    });
  } catch (err) {
    console.error('[passkey] authentication verification failed', err);
    return NextResponse.json({ error: "Couldn't verify that passkey -- try again." }, { status: 400 });
  }
  if (!verification.verified) {
    return NextResponse.json({ error: "Couldn't verify that passkey -- try again." }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { id: stored.userId }, include: { profile: true } });
  if (!user || user.status === 'DELETED') {
    return NextResponse.json({ error: user ? DELETED_ACCOUNT_MESSAGE : 'not found' }, { status: user ? 403 : 404 });
  }

  await db.webAuthnCredential.update({
    where: { id: stored.id },
    data: { counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() },
  });

  await createSession({ userId: user.id }, { method: 'passkey' });
  await issueTrustedDevice(user.id);

  return NextResponse.json({ ok: true, next: nextPathAfterAuth({ phoneVerified: user.phoneVerified, profile: user.profile }) });
}
