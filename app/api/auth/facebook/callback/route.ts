import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createSession } from '@/lib/session';
import { exchangeFacebookCodeForProfile } from '@/lib/auth/facebookOAuth';
import { verifySocialOAuthState } from '@/lib/auth/oauthState';
import { isBetaAllowed } from '@/lib/auth/betaAllowlist';

/**
 * Same shape as app/api/auth/google/callback/route.ts -- see its
 * comment. One extra wrinkle Google doesn't have: Facebook lets someone
 * decline the `email` permission on its consent screen, so
 * exchangeFacebookCodeForProfile() can legitimately come back with
 * email: null. That's fine here -- User.email is already nullable
 * (phone-only accounts have always had a null email), so the account is
 * still created, just without an email on file.
 */
export async function GET(req: NextRequest) {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const redirectToLogin = (error: string) => NextResponse.redirect(`${base}/login?error=${error}`);

  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const providerError = req.nextUrl.searchParams.get('error');

  if (providerError) {
    return redirectToLogin('oauth_cancelled');
  }
  if (!code || !state || !(await verifySocialOAuthState(state, 'facebook'))) {
    return redirectToLogin('oauth_invalid');
  }

  try {
    const profile = await exchangeFacebookCodeForProfile(code);

    // profile.email can be null (Facebook lets someone decline the email
    // permission) -- isBetaAllowed(null) is false, so a declined-email
    // sign-in is correctly refused rather than silently let through.
    if (!isBetaAllowed(profile.email)) {
      return redirectToLogin('not_invited');
    }

    const user = await db.user.upsert({
      where: { facebookId: profile.facebookId },
      update: { lastActiveAt: new Date() },
      create: {
        facebookId: profile.facebookId,
        email: profile.email,
        // Any email Facebook's Graph API hands back is already a
        // confirmed address on that Facebook account -- there's no
        // separate "email_verified" flag to check, unlike Google's.
        emailVerified: Boolean(profile.email),
      },
      include: { profile: true },
    });

    await createSession({ userId: user.id }, { method: 'facebook' });
    return NextResponse.redirect(`${base}/${user.profile ? 'discover' : 'onboarding'}`);
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002') {
      return redirectToLogin('email_in_use');
    }
    console.error('[auth/facebook/callback] failed', err);
    return redirectToLogin('oauth_failed');
  }
}
