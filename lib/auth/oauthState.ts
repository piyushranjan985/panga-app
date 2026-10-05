import { SignJWT, jwtVerify } from 'jose';

/**
 * Shared OAuth2 `state` param signer for the real social-login providers
 * (Google, Apple) below -- same CSRF-protection role as
 * lib/safety/identityVerification.ts's signVerificationState, just without
 * a userId to embed: at login time there's no session yet (that's the
 * whole point of this redirect), so the only thing this needs to prove on
 * the way back is "this callback really followed a redirect we issued a
 * few minutes ago for THIS provider", not "for this specific user".
 *
 * Reuses SESSION_JWT_SECRET (no new secret to generate/rotate) --
 * distinguished from a real session cookie, and from
 * identityVerification.ts's own state tokens, by its `aud` claim.
 */
const STATE_SECRET = new TextEncoder().encode(
  process.env.SESSION_JWT_SECRET || 'dev-only-change-me-please-generate-a-real-secret',
);
const STATE_TTL_SECONDS = 60 * 10; // 10 minutes -- plenty for a consent screen, short enough to limit replay risk
const AUDIENCE = 'social_oauth_state';

// Apple Sign-In was removed 2026-10-05 (scaffold only, never configured
// in any environment -- see docs/PHONE_FIRST_AUTH.md). Kept as a union
// of one, not a bare string literal, so a second real OAuth provider
// can be added here again without reshaping every call site.
export type SocialProvider = 'google';

/**
 * `provider` is embedded and re-checked on verify so a state token minted
 * for one provider's flow can't be replayed against another's callback --
 * kept generic (SocialProvider is a union, currently of one) in case a
 * second real OAuth provider is added later.
 */
export async function signSocialOAuthState(provider: SocialProvider): Promise<string> {
  return new SignJWT({ provider })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${STATE_TTL_SECONDS}s`)
    .sign(STATE_SECRET);
}

export async function verifySocialOAuthState(token: string, provider: SocialProvider): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, STATE_SECRET, { audience: AUDIENCE });
    return payload.provider === provider;
  } catch {
    return false;
  }
}
