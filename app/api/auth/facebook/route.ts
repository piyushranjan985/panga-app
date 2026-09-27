import { NextResponse } from 'next/server';
import { isFacebookOAuthConfigured, buildFacebookAuthorizationUrl } from '@/lib/auth/facebookOAuth';
import { signSocialOAuthState } from '@/lib/auth/oauthState';

/**
 * Same shape as app/api/auth/google/route.ts -- see its comment.
 */
export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (!isFacebookOAuthConfigured()) {
    return NextResponse.redirect(`${appUrl.replace(/\/$/, '')}/login?mock=facebook`);
  }

  const state = await signSocialOAuthState('facebook');
  return NextResponse.redirect(buildFacebookAuthorizationUrl(state));
}
