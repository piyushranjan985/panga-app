import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { webauthnRpID, webauthnExpectedOrigins, labelFromUserAgent } from '@/lib/webauthn';
import { consumeWebauthnChallenge } from '@/lib/auth/webauthnChallenge';

/**
 * Step 2 of "Add a passkey" -- verifies the attestation the browser's
 * @simplewebauthn/browser startRegistration() produced against the
 * challenge ./register-options issued, then saves the credential. The
 * label is a one-time guess from this request's own User-Agent (see
 * lib/webauthn.ts's labelFromUserAgent) -- good enough to tell passkeys
 * apart on the "Manage passkeys" list, not meant to be perfectly
 * accurate.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const expectedChallenge = await consumeWebauthnChallenge();
  if (!expectedChallenge) {
    return NextResponse.json({ error: 'That passkey setup attempt expired -- try again.' }, { status: 400 });
  }

  const response = await req.json().catch(() => null);
  if (!response) {
    return NextResponse.json({ error: 'Invalid passkey response.' }, { status: 400 });
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: webauthnExpectedOrigins(),
      expectedRPID: webauthnRpID(),
    });
  } catch (err) {
    console.error('[passkey] registration verification failed', err);
    return NextResponse.json({ error: "Couldn't verify that passkey -- try again." }, { status: 400 });
  }
  if (!verification.verified) {
    return NextResponse.json({ error: "Couldn't verify that passkey -- try again." }, { status: 400 });
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  const userAgent = (await headers()).get('user-agent');

  try {
    const saved = await db.webAuthnCredential.create({
      data: {
        userId: session.userId,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports ?? [],
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        label: labelFromUserAgent(userAgent),
      },
      select: { id: true, label: true, createdAt: true },
    });
    return NextResponse.json({ ok: true, credential: saved });
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002') {
      return NextResponse.json({ error: 'That passkey is already registered.' }, { status: 409 });
    }
    throw err;
  }
}
