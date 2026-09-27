/**
 * Real "Sign in with Google" -- OAuth2 authorization-code flow against
 * Google's own endpoints, no next-auth/openid-client dependency (this
 * project has none installed, and the whole flow is ~4 fetches, the same
 * shape lib/safety/identityVerification.ts already uses for DigiLocker).
 *
 * REAL CREDENTIALS: GOOGLE_CLIENT_ID/SECRET come from a free Google Cloud
 * project (console.cloud.google.com) -- create an OAuth 2.0 Client ID
 * (type "Web application"), add this app's callback URL (see
 * redirectUri() below) under "Authorized redirect URIs", and fill in the
 * OAuth consent screen (app name, support email, privacy policy URL --
 * NEXT_PUBLIC_APP_URL/privacy if that page exists, otherwise any real
 * page). That's the one step that can't happen from this codebase: it
 * needs your own Google account and agreement to Google's terms. Cost:
 * $0 -- Google doesn't charge for "Sign in with Google" at any volume.
 *
 * VERIFICATION: while the consent screen is in "Testing" status, only
 * accounts you explicitly add as test users can sign in -- fine for
 * building/QA, not for real users. Submitting for verification (still
 * free) removes that cap; because this only ever requests the
 * `openid email profile` scopes (Google's own "non-sensitive" tier, not
 * the restricted-scope tier that needs a paid CASA security assessment),
 * that review is normally fast and doesn't require the expensive audit
 * some other Google APIs do.
 *
 * Until GOOGLE_CLIENT_ID/SECRET are set, app/api/auth/google/route.ts
 * falls back to the existing mock consent screen (app/login/page.tsx) --
 * no code path here runs at all, exactly like VERIFICATION_PROVIDER=mock
 * bypassing identityVerification.ts's DigiLocker functions.
 */

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function googleRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${base.replace(/\/$/, '')}/api/auth/google/callback`;
}

export function buildGoogleAuthorizationUrl(state: string): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID || '');
  url.searchParams.set('redirect_uri', googleRedirectUri());
  // openid (for a stable `sub` id) + email + profile (name) -- exactly
  // what mock-google's simulated profile provides today, nothing more.
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  // Always show the account chooser rather than silently reusing
  // whichever Google account the browser is already signed into -- most
  // people have more than one, and a dating app is exactly the kind of
  // account where "which Google login did I use" mistakes are annoying
  // to unwind later.
  url.searchParams.set('prompt', 'select_account');
  return url.toString();
}

interface GoogleTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

interface GoogleUserinfo {
  sub: string; // stable per-Google-account id -- this is what googleId is built from
  email?: string;
  email_verified?: boolean;
  name?: string;
}

export interface GoogleProfile {
  googleId: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

/**
 * Exchanges the authorization code for an access token, then calls
 * Google's OIDC userinfo endpoint with it -- deliberately not
 * independently re-verifying the id_token's JWT signature (which would
 * need fetching/caching Google's JWKS): the access token itself was
 * already handed to *this server* directly by Google, over TLS, in
 * exchange for GOOGLE_CLIENT_SECRET, which only this server holds -- so
 * Google's own userinfo response is already as trustworthy as verifying
 * the id_token would be, for one fewer moving part.
 */
export async function exchangeGoogleCodeForProfile(code: string): Promise<GoogleProfile> {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirect_uri: googleRedirectUri(),
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`Google token exchange failed (${tokenRes.status}): ${await tokenRes.text().catch(() => '')}`);
  }
  const token = (await tokenRes.json()) as GoogleTokenResponse;

  const userinfoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!userinfoRes.ok) {
    throw new Error(`Google userinfo fetch failed (${userinfoRes.status}): ${await userinfoRes.text().catch(() => '')}`);
  }
  const info = (await userinfoRes.json()) as GoogleUserinfo;

  return {
    googleId: info.sub,
    email: info.email ?? null,
    emailVerified: info.email_verified ?? false,
    name: info.name ?? null,
  };
}
