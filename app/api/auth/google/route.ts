import { NextResponse } from 'next/server';
import { isGoogleOAuthConfigured, buildGoogleAuthorizationUrl } from '@/lib/auth/googleOAuth';
import { signSocialOAuthState } from '@/lib/auth/oauthState';

/**
 * "Continue with Google" lands here as a plain top-level navigation (a
 * real <a href> in app/login/page.tsx, not a fetch -- Google's login page
 * can't be reached from client JS/CORS anyway, it has to be a real
 * browser redirect). Two branches:
 *
 *  - GOOGLE_CLIENT_ID/SECRET set: redirects to Google's own consent
 *    screen. app/api/auth/google/callback/route.ts handles the return
 *    trip.
 *  - Not configured (default): redirects straight back to the login
 *    page with ?mock=google, which auto-opens the existing mock consent
 *    form (see app/login/page.tsx) -- same fallback behavior as before
 *    this route existed, just reached via a redirect instead of the
 *    button's onClick going straight to setSocialProvider('google').
 */
export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (!isGoogleOAuthConfigured()) {
    return NextResponse.redirect(`${appUrl.replace(/\/$/, '')}/login?mock=google`);
  }

  const state = await signSocialOAuthState('google');
  return NextResponse.redirect(buildGoogleAuthorizationUrl(state));
}
