import { Client } from '@upstash/qstash';

/**
 * Thin, optional wrapper around Upstash QStash -- same "ships before the
 * integration is configured, upgrades the moment it is" pattern as
 * lib/cache.ts's Redis wrapper, and the same vendor/account the app
 * already uses for Redis.
 *
 * What this solves: a Vercel serverless function can't sleep -- there's
 * no way for one invocation to "wait until 7:45pm, then do more work"
 * without burning (and eventually exceeding) its own maxDuration. QStash
 * is the $0-at-current-scale way around that: it's a service that calls
 * one of our own API routes later, over plain HTTPS -- like a cron
 * trigger, except we pick exactly when "later" is, to the second, on
 * every Vercel plan. Vercel's own Cron is capped on Hobby to once a day
 * with up to +/-59min of slop (see docs/MYSTERY_MATCH.md S11) -- but a
 * QStash message isn't a "Vercel Cron Job" at all, so neither limit
 * applies to it; it's just an authenticated POST to our own route.
 *
 * Deliberately NOT one QStash message per push notification -- at real
 * volume that would blow past the free tier (1,000 messages/day as of
 * this writing) and scale QStash's cost with user count for no reason.
 * Instead this schedules a handful of "wake up and drain whatever's due"
 * calls (app/api/cron/mystery-match-deliver), which reschedules itself
 * roughly every 5 minutes for about an hour -- ~12-15 messages for the
 * whole day's run, flat whether 50 or 500,000 people are in the pool.
 */
let client: Client | null = null;
try {
  if (process.env.QSTASH_TOKEN) {
    client = new Client({ token: process.env.QSTASH_TOKEN });
  }
} catch {
  client = null;
}

export const queueConfigured = client !== null;

/**
 * Schedules a POST to `path` on this app's own deployment
 * (NEXT_PUBLIC_APP_URL -- the same env var already used for the Google
 * OAuth callback) to fire at or after `notBefore`, authenticated exactly
 * the way Vercel's own cron invocations are (Authorization: Bearer
 * CRON_SECRET) -- see app/api/cron/mystery-match-deliver/route.ts, which
 * checks it identically either way, so there's no second auth concept to
 * maintain for "Vercel Cron fired this" vs "QStash fired this".
 *
 * Throws on failure rather than swallowing it, unlike lib/cache.ts's
 * reads/writes -- this is the one link in the chain where silently doing
 * nothing means the day's notifications never go out at all, so the
 * caller (app/api/cron/mystery-match) needs to know and log loudly
 * rather than fail soft and leave everyone's pairing silently unsent.
 */
export async function scheduleWake(path: string, body: Record<string, unknown>, notBefore: Date): Promise<void> {
  if (!client) throw new Error('QStash is not configured (QSTASH_TOKEN missing)');
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!baseUrl) throw new Error('NEXT_PUBLIC_APP_URL is not configured; QStash needs an absolute callback URL');
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error('CRON_SECRET is not configured');

  await client.publishJSON({
    url: new URL(path, baseUrl).toString(),
    body,
    notBefore: Math.floor(notBefore.getTime() / 1000),
    headers: { Authorization: `Bearer ${secret}` },
    retries: 3,
  });
}
