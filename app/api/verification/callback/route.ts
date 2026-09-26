import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  verifyVerificationState,
  exchangeDigilockerCode,
  fetchDigilockerIdentityDocument,
  finalizeIdentityVerification,
} from '@/lib/safety/identityVerification';

/**
 * DigiLocker redirects the user's browser here with ?code=&state= after
 * they consent (or ?error= if they decline/it fails on DigiLocker's
 * side). Only reachable when VERIFICATION_PROVIDER=digilocker -- mock
 * mode never leaves the app, see app/api/verification/route.ts.
 *
 * No session cookie is required to *read* this request (DigiLocker's
 * redirect won't carry one reliably across all mobile browser/webview
 * contexts) -- the signed `state` token is what identifies the user
 * instead, exactly the CSRF/identity role an OAuth `state` param is
 * supposed to play.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const providerError = req.nextUrl.searchParams.get('error');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const redirectWith = (result: 'done' | 'failed' | 'invalid') =>
    NextResponse.redirect(`${appUrl.replace(/\/$/, '')}/profile?verification=${result}`);

  if (providerError) {
    console.error('[verification/callback] DigiLocker returned an error', providerError);
    return redirectWith('failed');
  }
  if (!code || !state) return redirectWith('invalid');

  const verifiedState = await verifyVerificationState(state);
  if (!verifiedState) return redirectWith('invalid');

  try {
    const accessToken = await exchangeDigilockerCode(code);
    const document = await fetchDigilockerIdentityDocument(accessToken);
    await finalizeIdentityVerification({ userId: verifiedState.userId, provider: 'digilocker', document });
    return redirectWith('done');
  } catch (err) {
    console.error('[verification/callback] failed', err);
    // Fail safe: route to manual review rather than leaving the account
    // stuck PENDING with no path forward. An admin can re-trigger or
    // manually decide from the moderation queue.
    await db.profile
      .update({ where: { userId: verifiedState.userId }, data: { verification: 'MANUAL_REVIEW' } })
      .catch(() => {});
    await db.moderationCase
      .create({
        data: {
          subjectUserId: verifiedState.userId,
          sourceType: 'AUTOMATED_FLAG',
          category: 'identity_verification',
          severity: 'MEDIUM',
          status: 'OPEN',
          evidence: { failureReason: 'digilocker_callback_error', message: err instanceof Error ? err.message : String(err) },
        },
      })
      .catch(() => {});
    return redirectWith('failed');
  }
}
