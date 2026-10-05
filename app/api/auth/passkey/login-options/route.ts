import { NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { webauthnRpID } from '@/lib/webauthn';
import { setWebauthnChallenge } from '@/lib/auth/webauthnChallenge';

/**
 * Step 1 of "Sign in with a passkey" -- unauthenticated by nature (this
 * IS the sign-in). No allowCredentials means the browser surfaces
 * whatever discoverable passkey(s) it has for this RP ID itself -- no
 * phone/email typed first, which is the whole point of a passkey login
 * button. ./login-verify resolves WHICH account afterward, from the
 * credential id the browser hands back.
 */
export async function POST() {
  const options = await generateAuthenticationOptions({
    rpID: webauthnRpID(),
    userVerification: 'preferred',
  });

  await setWebauthnChallenge(options.challenge);

  return NextResponse.json({ options });
}
