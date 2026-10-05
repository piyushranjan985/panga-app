import { NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { WEBAUTHN_RP_NAME, webauthnRpID } from '@/lib/webauthn';
import { setWebauthnChallenge } from '@/lib/auth/webauthnChallenge';

/**
 * Step 1 of "Add a passkey" (Profile settings) -- see
 * docs/PHONE_FIRST_AUTH.md. Requires a session (you can only add a
 * passkey to an account you're already signed into some other way).
 * residentKey: 'preferred' asks for a discoverable credential so login
 * later needs no typed identifier first (a one-tap passkey button, see
 * app/api/auth/passkey/login-options/route.ts) without requiring it on
 * every authenticator, some of which don't support 'required'.
 */
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const [user, existingCredentials] = await Promise.all([
    db.user.findUnique({ where: { id: session.userId }, select: { phone: true, email: true } }),
    db.webAuthnCredential.findMany({ where: { userId: session.userId }, select: { credentialId: true, transports: true } }),
  ]);
  if (!user) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const options = await generateRegistrationOptions({
    rpName: WEBAUTHN_RP_NAME,
    rpID: webauthnRpID(),
    userName: user.phone || user.email || session.userId,
    userID: new TextEncoder().encode(session.userId),
    attestationType: 'none',
    excludeCredentials: existingCredentials.map((c) => ({ id: c.credentialId, transports: c.transports })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  });

  await setWebauthnChallenge(options.challenge);

  return NextResponse.json({ options });
}
