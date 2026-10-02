/**
 * Push notifications via Firebase Cloud Messaging (FCM) -- the single
 * provider for iOS, Android, and web (see docs/PUSH_NOTIFICATIONS.md §0:
 * confirmed genuinely free with no send-volume cap, and one SDK/API
 * instead of wiring APNs + FCM + web-push separately). Talks to FCM's
 * HTTP v1 API directly with plain fetch() -- no firebase-admin
 * dependency, same house style as lib/auth/googleOAuth.ts and
 * lib/safety/identityVerification.ts's DigiLocker calls -- authenticated
 * with a Google service-account JWT signed via the `jose` package this
 * codebase already depends on (lib/sessionToken.ts and
 * identityVerification.ts use it for symmetric HMAC JWTs; this is the
 * first RS256/asymmetric use of it, which jose supports natively).
 *
 * SETUP (the one part that can't happen from this codebase, same
 * category as creating the Brevo/MSG91/StartMessaging accounts
 * lib/notifications/email.ts and sms-*.ts needed): create a free Firebase
 * project at console.firebase.google.com, add the iOS/Android/Web apps to
 * it, then under Project settings > Service accounts > Generate new
 * private key to download a service-account JSON file. Set
 * FIREBASE_SERVICE_ACCOUNT_JSON to that file's entire contents as a
 * single-line JSON string env var -- never commit the file itself. Web
 * push additionally needs a VAPID key pair (Project settings > Cloud
 * Messaging > Web configuration) -- see lib/notifications/pushClient.ts
 * for where that's used. Cost: $0 at any volume.
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

export function isPushConfigured(): boolean {
  return loadServiceAccount() !== null;
}

export class PushSendError extends Error {}

// In-memory OAuth2 access-token cache. Serverless functions are
// short-lived, so this mainly helps a single warm instance sending
// several pushes in a row (e.g. the daily date-feedback cron fanning out
// to many users) rather than across cold starts -- still worth it, since
// it turns N token fetches into 1 for that batch.
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
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new PushSendError(`Failed to get an FCM access token (${res.status}): ${body}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

function fillTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => vars[key] ?? '');
}

export type PushCategory = 'matchesMessages' | 'vybeVouch' | 'reminders';

/**
 * Checks the relevant one of Profile's 3 notification toggles (see
 * docs/PUSH_NOTIFICATIONS.md §5 / app/profile/page.tsx's Notifications
 * section) before a trigger site bothers calling sendPushToUser at all.
 * A missing profile (shouldn't happen for a real user, but the type
 * allows it) fails closed -- no profile, no push.
 */
export async function isPushCategoryEnabled(userId: string, category: PushCategory): Promise<boolean> {
  const profile = await db.profile.findUnique({
    where: { userId },
    select: { notifyMatchesMessages: true, notifyVybeVouch: true, notifyReminders: true },
  });
  if (!profile) return false;
  if (category === 'matchesMessages') return profile.notifyMatchesMessages;
  if (category === 'vybeVouch') return profile.notifyVybeVouch;
  return profile.notifyReminders;
}

// How long a Match.chatOpenAAt/chatOpenBAt bump is trusted as "still
// open" -- see app/api/matches/[matchId]/heartbeat/route.ts, called from
// the chat page's existing 4s poll. Wider than that poll interval so a
// single missed beat (a slow network tick) doesn't momentarily un-suppress
// the badge, but still short enough that closing the tab stops suppressing
// new-message pushes within seconds, not minutes.
const CHAT_OPEN_RECENCY_MS = 15_000;

/** True when `timestamp` (a Match.chatOpenAAt/BAt value) was bumped recently enough to trust as "still open". */
export function isChatOpenRecently(timestamp: Date | null): boolean {
  return Boolean(timestamp && Date.now() - timestamp.getTime() < CHAT_OPEN_RECENCY_MS);
}

/**
 * Sends `templateKey`'s push notification (its `channel: 'push'` row in
 * NotificationTemplate -- see admin/scripts/seed-admin.ts for the 5
 * triggers' rows) to every non-revoked device on file for `userId`,
 * filling {{placeholders}} in the title/body from `vars`.
 *
 * Silently no-ops -- never throws -- when push isn't configured, the
 * template is missing/wrong-channel, or the user has no device tokens.
 * Every call site here is fire-and-forget after the triggering write
 * already succeeded (a match, a message, a Vybe Vouch response): a
 * missing/misconfigured push setup must never fail the underlying
 * action. Cleans up tokens FCM reports as unregistered/invalid as it
 * goes, so a stale token (app uninstalled, token rotated) stops being
 * retried on every future send.
 */
export async function sendPushToUser(userId: string, templateKey: string, vars: Record<string, string> = {}): Promise<void> {
  const account = loadServiceAccount();
  if (!account) return;

  const [template, tokens] = await Promise.all([
    db.notificationTemplate.findUnique({ where: { key: templateKey } }),
    db.deviceToken.findMany({ where: { userId, revokedAt: null } }),
  ]);
  if (!template || template.channel !== 'push' || tokens.length === 0) return;

  let accessToken: string;
  try {
    accessToken = await getAccessToken(account);
  } catch (err) {
    console.error('[push] could not get an FCM access token', err);
    return;
  }

  const title = template.subject ? fillTemplate(template.subject, vars) : 'findmyVybe';
  const body = fillTemplate(template.body, vars);
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
              data: { key: templateKey },
              webpush: { fcmOptions: { link: appUrl } },
            },
          }),
        });
      } catch (err) {
        console.error('[push] send failed (network)', err);
        return;
      }
      if (res.ok) return;

      const errBody = await res.json().catch(() => null);
      const status = errBody?.error?.status;
      // UNREGISTERED / NOT_FOUND / INVALID_ARGUMENT -- the token is stale
      // (uninstalled, permission revoked, rotated). Anything else (a
      // transient 5xx, rate limiting) is left alone for the next trigger
      // to retry naturally rather than guessing at retry logic here.
      if (status === 'UNREGISTERED' || status === 'NOT_FOUND' || status === 'INVALID_ARGUMENT') {
        await db.deviceToken.update({ where: { id: t.id }, data: { revokedAt: new Date() } }).catch(() => {});
      }
    }),
  );
}
