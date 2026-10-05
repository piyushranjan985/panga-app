import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createSession } from '@/lib/session';
import { issueTrustedDevice } from '@/lib/trustedDevice';
import { nextPathAfterAuth } from '@/lib/auth/postAuthRedirect';
import { exchangeGoogleCodeForProfile } from '@/lib/auth/googleOAuth';
import { verifySocialOAuthState } from '@/lib/auth/oauthState';
import { isBetaAllowed } from '@/lib/auth/betaAllowlist';

/**
 * Google redirects the user's browser here with ?code=&state= after they
 * consent (or ?error=access_denied if they hit Cancel). Only reached when
 * app/api/auth/google/route.ts actually sent them to Google in the first
 * place -- i.e. only when GOOGLE_CLIENT_ID/SECRET are set. No session
 * cookie exists yet (that's the point of this route), so the signed
 * `state` param is what proves this callback follows a redirect this
 * server issued a few minutes ago, same CSRF role as
 * identityVerification.ts's state token plays for DigiLocker.
 */
export async function GET(req: NextRequest) {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const redirectToLogin = (error: string) => NextResponse.redirect(`${base}/login?error=${error}`);

  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const providerError = req.nextUrl.searchParams.get('error');

  if (providerError) {
    // Most commonly "access_denied" -- they hit Cancel on Google's own
    // consent screen. Not a bug on our end, so no alarming message.
    return redirectToLogin('oauth_cancelled');
  }
  if (!code || !state || !(await verifySocialOAuthState(state, 'google'))) {
    return redirectToLogin('oauth_invalid');
  }

  try {
    const profile = await exchangeGoogleCodeForProfile(code);

    if (!isBetaAllowed(profile.email)) {
      return redirectToLogin('not_invited');
    }

    const user = await db.user.upsert({
      where: { googleId: profile.googleId },
      update: { lastActiveAt: new Date() },
      create: {
        googleId: profile.googleId,
        email: profile.email,
        emailVerified: profile.emailVerified,
      },
      include: { profile: true },
    });

    // Same check every other sign-in route makes -- see
    // lib/accountEnforcement.ts's DELETED_ACCOUNT_MESSAGE doc comment.
    // Redirect-based here (like the other error cases above) rather than a
    // JSON 403, since this route's caller is the browser following
    // Google's own redirect, not a fetch() call the login page can read
    // a body from.
    if (user.status === 'DELETED') {
      return redirectToLogin('account_deleted');
    }

    await createSession({ userId: user.id }, { method: 'google' });
    await issueTrustedDevice(user.id);
    return NextResponse.redirect(`${base}${nextPathAfterAuth({ phoneVerified: user.phoneVerified, profile: user.profile })}`);
  } catch (err: unknown) {
    // Same collision this demo's mock-google route already surfaces:
    // this Google account's email already backs a different (phone/email
    // OTP) account, and account linking across methods isn't supported
    // yet -- see lib/session.ts's SessionPayload comment.
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002') {
      return redirectToLogin('email_in_use');
    }
    console.error('[auth/google/callback] failed', err);
    return redirectToLogin('oauth_failed');
  }
}
