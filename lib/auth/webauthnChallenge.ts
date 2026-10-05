import { cookies } from 'next/headers';

/**
 * The one piece of state a WebAuthn ceremony needs between its "options"
 * call and its "verify" call: the exact challenge string the browser's
 * authenticator signed. A short-lived httpOnly cookie round-trips it
 * automatically without a server-side store -- same "stateless, cookie-
 * carried" shape as lib/auth/oauthState.ts's signed `state` param, just
 * a plain value here (no signing needed: it's httpOnly so client JS
 * can't read or alter it, and a tampered value would simply fail
 * verifyRegistrationResponse/verifyAuthenticationResponse's own
 * expectedChallenge comparison, not open up anything else).
 *
 * One cookie name serves both registration and authentication -- they're
 * never in flight at once for the same browser (registration requires an
 * existing session; a login attempt, by definition, doesn't have one
 * yet).
 */
const COOKIE_NAME = 'findmyvybe_wa_challenge';
const TTL_SECONDS = 60 * 5; // 5 minutes -- plenty for a passkey prompt, short enough to limit replay risk

export async function setWebauthnChallenge(challenge: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: TTL_SECONDS,
  });
}

export async function consumeWebauthnChallenge(): Promise<string | null> {
  const cookieStore = await cookies();
  const challenge = cookieStore.get(COOKIE_NAME)?.value ?? null;
  cookieStore.set(COOKIE_NAME, '', { path: '/', maxAge: 0 });
  return challenge;
}
