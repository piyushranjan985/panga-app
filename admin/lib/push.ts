/**
 * A minimal, admin-side push sender for moderation-outcome notifications
 * -- NOT a full copy of the root app's lib/notifications/push.ts (its
 * NotificationTemplate-driven templating, resend-cooldown bookkeeping,
 * etc. aren't needed for the one fixed message this file sends). Same
 * FCM HTTP v1 API, same OAuth2 service-account JWT approach, same
 * "silently no-op, never throw" contract -- duplicated rather than
 * imported because admin/ is a separate Next.js app/Prisma Client with
 * its own @/* alias (see admin/lib/db.ts's comment; root's lib/* isn't
 * importable from here even though both share one DATABASE_URL).
 *
 * SETUP: this needs its OWN copy of FIREBASE_SERVICE_ACCOUNT_JSON set on
 * the ADMIN portal's Vercel project -- the root app having it configured
 * does NOT cover this, since these are two separate deployments/env-var
 * scopes. Same value, just set in both places. Silently no-ops (like
 * the root app's push.ts) if it's missing here, so a moderation
 * resolution never fails just because this wasn't set up yet.
 */

import { SignJWT, importPKCS8 } from 'jose';
import { db } from '@/lib/db';

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

function loadServiceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) return null;
    return parsed as ServiceAccount;
  } catch {
    return null;
  }
}

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

async function getAccessToken(account: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.accessToken;
  }
  const now = Math.floor(Date.now() / 1000);
  const privateKey = await importPKCS8(account.private_key, 'RS256');
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt(now)
    .setIssuer(account.client_email)
    .setSubject(account.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setExpirationTime(now + 3600)
    .sign(privateKey);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`FCM token fetch failed (${res.status})`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

/**
 * Notifies a user that a photo of theirs cleared manual review, one way
 * or the other. Fire-and-forget: never throws, so a missing Firebase
 * setup or a send failure never blocks the admin's resolve/dismiss
 * action that triggered this.
 */
export async function sendPhotoModerationPush(userId: string, outcome: 'approved' | 'rejected'): Promise<void> {
  const account = loadServiceAccount();
  if (!account) return;

  const tokens = await db.deviceToken.findMany({ where: { userId, revokedAt: null } });
  if (tokens.length === 0) return;

  let accessToken: string;
  try {
    accessToken = await getAccessToken(account);
  } catch (err) {
    console.error('[admin-push] could not get an FCM access token', err);
    return;
  }

  const title = outcome === 'approved' ? 'Your photo is live' : 'About your photo';
  const body =
    outcome === 'approved'
      ? "Your photo cleared review and is now visible to others -- you're all set."
      : "Your photo didn't clear review, so it's not visible to others. Try uploading a different one from your profile.";
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://findmyvybe.com').replace(/\/$/, '');

  await Promise.all(
    tokens.map(async (t) => {
      let res: Response;
      try {
        res = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            message: {
              token: t.token,
              notification: { title, body },
              data: { key: 'photo_moderation' },
              webpush: { fcmOptions: { link: appUrl } },
            },
          }),
        });
      } catch (err) {
        console.error('[admin-push] send failed (network)', err);
        return;
      }
      if (res.ok) return;
      const errBody = await res.json().catch(() => null);
      const status = errBody?.error?.status;
      if (status === 'UNREGISTERED' || status === 'NOT_FOUND' || status === 'INVALID_ARGUMENT') {
        await db.deviceToken.update({ where: { id: t.id }, data: { revokedAt: new Date() } }).catch(() => {});
      }
    }),
  );
}
