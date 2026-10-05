import { NextResponse } from 'next/server';
import { isAppleOAuthConfigured, buildAppleAuthorizationUrl } from '@/lib/auth/appleOAuth';
import { signSocialOAuthState } from '@/lib/auth/oauthState';

/**
 * "Continue with Apple" -- same shape as app/api/auth/google/route.ts.
 * A real top-level navigation (Apple's own sign-in page can't be reached
 * from client JS/CORS either). Two branches:
 *
 *  - APPLE_TEAM_ID/CLIENT_ID/KEY_ID/PRIVATE_KEY all set: redirects to
 *    Apple's real consent screen. app/api/auth/apple/callback/route.ts
 *    handles the return trip -- as a POST, not a GET, since Apple uses
 *    response_mode=form_post whenever more than the bare id is requested
 *    (see lib/auth/appleOAuth.ts).
 *  - Not configured (default): redirects back to the login page with
 *    ?mock=apple, which opens the existing mock-consent pattern (same
 *    fallback app/api/auth/google/route.ts uses for Google).
 */
export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (!isAppleOAuthConfigured()) {
    return NextResponse.redirect(`${appUrl.replace(/\/$/, '')}/login?mock=apple`);
  }

  const state = await signSocialOAuthState('apple');
  return NextResponse.redirect(buildAppleAuthorizationUrl(state));
}
