import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createSession } from '@/lib/session';
import { issueTrustedDevice } from '@/lib/trustedDevice';
import { nextPathAfterAuth } from '@/lib/auth/postAuthRedirect';
import { exchangeAppleCodeForProfile } from '@/lib/auth/appleOAuth';
import { verifySocialOAuthState } from '@/lib/auth/oauthState';
import { isBetaAllowed } from '@/lib/auth/betaAllowlist';

/**
 * Apple posts back here (response_mode=form_post -- see
 * lib/auth/appleOAuth.ts's buildAppleAuthorizationUrl) with form-encoded
 * code/state after consent, so this is a POST handler reading
 * req.formData(), not a GET reading query params like Google's callback.
 * Otherwise an exact mirror of app/api/auth/google/callback/route.ts --
 * same CSRF-state check, same beta allowlist, same DELETED-account check,
 * same P2002-collision handling for "this email already backs a
 * different sign-in method."
 */
export async function POST(req: NextRequest) {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const redirectToLogin = (error: string) => NextResponse.redirect(`${base}/login?error=${error}`);

  const form = await req.formData().catch(() => null);
  const code = form?.get('code');
  const state = form?.get('state');
  const providerError = form?.get('error');

  if (providerError) {
    return redirectToLogin('oauth_cancelled');
  }
  if (typeof code !== 'string' || typeof state !== 'string' || !(await verifySocialOAuthState(state, 'apple'))) {
    return redirectToLogin('oauth_invalid');
  }

  try {
    const profile = await exchangeAppleCodeForProfile(code);

    if (!isBetaAllowed(profile.email)) {
      return redirectToLogin('not_invited');
    }

    const user = await db.user.upsert({
      where: { appleId: profile.appleId },
      update: { lastActiveAt: new Date() },
      create: {
        appleId: profile.appleId,
        email: profile.email,
        emailVerified: profile.emailVerified,
      },
      include: { profile: true },
    });

    if (user.status === 'DELETED') {
      return redirectToLogin('account_deleted');
    }

    await createSession({ userId: user.id }, { method: 'apple' });
    await issueTrustedDevice(user.id);
    return NextResponse.redirect(`${base}${nextPathAfterAuth({ phoneVerified: user.phoneVerified, profile: user.profile })}`);
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002') {
      return redirectToLogin('email_in_use');
    }
    console.error('[auth/apple/callback] failed', err);
    return redirectToLogin('oauth_failed');
  }
}
