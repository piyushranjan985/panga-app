import { SignJWT, importPKCS8, decodeJwt } from 'jose';

/**
 * Real "Sign in with Apple" -- same ~4-fetch OAuth2/OIDC shape as
 * lib/auth/googleOAuth.ts, no extra dependency (uses `jose`, already a
 * dependency for session/OAuth-state JWTs elsewhere in this project).
 *
 * REAL CREDENTIALS -- all four need an Apple Developer Program enrollment
 * ($99/year), which can't happen from this codebase:
 *   - APPLE_TEAM_ID -- your 10-character Apple Developer Team ID.
 *   - APPLE_CLIENT_ID -- a Services ID you create (developer.apple.com ->
 *     Certificates, Identifiers & Profiles -> Identifiers -> "+" ->
 *     Services IDs), with "Sign in with Apple" enabled and this app's
 *     callback URL (see appleRedirectUri() below) registered under
 *     "Return URLs". Also requires verifying this app's domain there.
 *   - APPLE_KEY_ID -- the Key ID of a "Sign in with Apple" private key
 *     you generate under Keys (same Certificates/Identifiers/Profiles
 *     area) -- downloadable ONCE, as a .p8 file.
 *   - APPLE_PRIVATE_KEY -- that .p8 file's contents, PEM text
 *     (-----BEGIN PRIVATE KEY-----...). Vercel env vars are single-line,
 *     so paste it with literal `\n` in place of real newlines -- this
 *     file undoes that (see pemFromEnv() below) the same way a lot of
 *     services' "paste your service account key" env vars work.
 *
 * Unlike Google, Apple doesn't hand you a static client secret -- it's a
 * short-lived JWT *you* sign with your own private key, minted fresh per
 * request here rather than cached/rotated (cheap to mint, and Apple's
 * own docs recommend keeping its lifetime short anyway).
 *
 * Until all four env vars are set, app/api/auth/apple/route.ts falls back
 * to the existing mock consent screen, exactly like Google's
 * isGoogleOAuthConfigured() gate.
 */

export function isAppleOAuthConfigured(): boolean {
  return Boolean(process.env.APPLE_TEAM_ID && process.env.APPLE_CLIENT_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY);
}

export function appleRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${base.replace(/\/$/, '')}/api/auth/apple/callback`;
}

function pemFromEnv(raw: string): string {
  return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
}

/**
 * Apple requires `response_mode=form_post` whenever `scope` includes
 * anything beyond the bare minimum (name/email here) -- the callback
 * route has to be a POST handler reading form-encoded fields, not a
 * GET with query params like Google's.
 */
export function buildAppleAuthorizationUrl(state: string): string {
  const url = new URL('https://appleid.apple.com/auth/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('response_mode', 'form_post');
  url.searchParams.set('client_id', process.env.APPLE_CLIENT_ID || '');
  url.searchParams.set('redirect_uri', appleRedirectUri());
  url.searchParams.set('scope', 'name email');
  url.searchParams.set('state', state);
  return url.toString();
}

/** Short-lived (10 min) ES256 JWT -- Apple's stand-in for a static client secret. */
async function buildAppleClientSecret(): Promise<string> {
  const key = await importPKCS8(pemFromEnv(process.env.APPLE_PRIVATE_KEY || ''), 'ES256');
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: process.env.APPLE_KEY_ID })
    .setIssuer(process.env.APPLE_TEAM_ID || '')
    .setSubject(process.env.APPLE_CLIENT_ID || '')
    .setAudience('https://appleid.apple.com')
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(key);
}

interface AppleTokenResponse {
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
}

export interface AppleProfile {
  appleId: string;
  email: string | null;
  emailVerified: boolean;
}

/**
 * Exchanges the authorization code for Apple's id_token and decodes it
 * (not independently re-verified against Apple's JWKS -- same trust
 * argument as lib/auth/googleOAuth.ts's exchangeGoogleCodeForProfile:
 * the token endpoint handed this directly to *this server*, over TLS, in
 * exchange for a client secret only this server can mint). Apple's `sub`
 * claim is the stable per-user id (this app's analogue of Google's
 * `sub`); `email_verified` arrives as the string `"true"`/`"false"`, not
 * a real boolean, so it's parsed explicitly rather than just truthy-
 * checked.
 */
export async function exchangeAppleCodeForProfile(code: string): Promise<AppleProfile> {
  const clientSecret = await buildAppleClientSecret();

  const tokenRes = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: process.env.APPLE_CLIENT_ID || '',
      client_secret: clientSecret,
      redirect_uri: appleRedirectUri(),
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`Apple token exchange failed (${tokenRes.status}): ${await tokenRes.text().catch(() => '')}`);
  }
  const token = (await tokenRes.json()) as AppleTokenResponse;
  const claims = decodeJwt(token.id_token) as { sub?: string; email?: string; email_verified?: string | boolean };

  return {
    appleId: claims.sub || '',
    email: claims.email ?? null,
    emailVerified: claims.email_verified === true || claims.email_verified === 'true',
  };
}
