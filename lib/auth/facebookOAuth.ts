/**
 * Real "Sign in with Facebook" -- OAuth2 authorization-code flow against
 * Meta's Graph API, same shape as googleOAuth.ts alongside it.
 *
 * NOT Instagram: Meta retired general-purpose "Sign in with Instagram"
 * for ordinary consumer apps (the current Instagram API only grants
 * login to Instagram Business/Creator accounts, aimed at content/DM
 * management tools, not "let any user sign into your app with their
 * personal Instagram") -- see app/login/page.tsx's SOCIAL_ENDPOINT
 * comment. The "Continue with Instagram" button stays on the mock
 * consent screen permanently, not just until credentials exist; there is
 * no real flow for this file to grow into for it.
 *
 * REAL CREDENTIALS: FACEBOOK_APP_ID/SECRET come from a free Meta app
 * (developers.facebook.com -> Create App -> add the "Facebook Login"
 * product), no cost at any volume. Two things Google's flow doesn't
 * need: (1) Meta's App Review for the `email`/`public_profile`
 * permissions before real (non-developer) users can log in -- while the
 * app is in "Development" mode, only accounts added as the app's own
 * admins/developers/testers can sign in, same practical effect as
 * Google's "Testing" status; (2) Meta increasingly requires Business
 * Verification (your organization's real business details) before
 * granting App Review for a live app -- both steps are free but take
 * real calendar time and need your own Meta account, so they can't
 * happen from this codebase. Add this app's callback URL (see
 * facebookRedirectUri() below) under Facebook Login > Settings > "Valid
 * OAuth Redirect URIs".
 *
 * Until FACEBOOK_APP_ID/SECRET are set, app/api/auth/facebook/route.ts
 * falls back to the existing mock consent screen -- no code path here
 * runs at all.
 */

// Graph API versions are deprecated ~2 years after release, not
// indefinitely stable like Google's endpoints -- overridable the same
// way DigiLocker's URLs are, so a future deprecation is a one-line .env
// change rather than a code change.
const GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';

export function isFacebookOAuthConfigured(): boolean {
  return Boolean(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);
}

export function facebookRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${base.replace(/\/$/, '')}/api/auth/facebook/callback`;
}

export function buildFacebookAuthorizationUrl(state: string): string {
  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', process.env.FACEBOOK_APP_ID || '');
  url.searchParams.set('redirect_uri', facebookRedirectUri());
  // public_profile (name) + email -- matches mock-facebook's simulated
  // profile. A person can still decline the email permission on
  // Facebook's own consent screen; exchangeFacebookCodeForProfile()
  // below handles that (email comes back null, not an error).
  url.searchParams.set('scope', 'email,public_profile');
  url.searchParams.set('state', state);
  return url.toString();
}

interface FacebookTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface FacebookGraphMeResponse {
  id: string;
  email?: string;
  name?: string;
}

export interface FacebookProfile {
  facebookId: string;
  email: string | null;
  name: string | null;
}

export async function exchangeFacebookCodeForProfile(code: string): Promise<FacebookProfile> {
  // Facebook's token endpoint takes the code exchange as a GET with query
  // params (not a POST body like Google/DigiLocker) -- this is Meta's own
  // documented shape for this endpoint, not a shortcut taken here.
  const tokenUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`);
  tokenUrl.searchParams.set('client_id', process.env.FACEBOOK_APP_ID || '');
  tokenUrl.searchParams.set('client_secret', process.env.FACEBOOK_APP_SECRET || '');
  tokenUrl.searchParams.set('redirect_uri', facebookRedirectUri());
  tokenUrl.searchParams.set('code', code);

  const tokenRes = await fetch(tokenUrl.toString());
  if (!tokenRes.ok) {
    throw new Error(`Facebook token exchange failed (${tokenRes.status}): ${await tokenRes.text().catch(() => '')}`);
  }
  const token = (await tokenRes.json()) as FacebookTokenResponse;

  const meUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/me`);
  meUrl.searchParams.set('fields', 'id,email,name');
  meUrl.searchParams.set('access_token', token.access_token);

  const meRes = await fetch(meUrl.toString());
  if (!meRes.ok) {
    throw new Error(`Facebook profile fetch failed (${meRes.status}): ${await meRes.text().catch(() => '')}`);
  }
  const me = (await meRes.json()) as FacebookGraphMeResponse;

  return {
    facebookId: me.id,
    email: me.email ?? null,
    name: me.name ?? null,
  };
}
