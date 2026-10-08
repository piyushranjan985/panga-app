import Ably from 'ably';

/**
 * Real-time chat delivery, via Ably's REST API.
 *
 * Same "ships before configured" pattern as lib/cache.ts (Upstash Redis)
 * and lib/queue/qstash.ts elsewhere in this codebase: every export below
 * is a safe no-op if ABLY_API_KEY isn't set, and the chat screen already
 * falls back to its original 4s poll when it can't get a realtime
 * connection -- see app/matches/[matchId]/page.tsx. Nothing breaks by
 * merging this before an Ably account exists; chat starts delivering
 * instantly the moment the env var is set, no further code change.
 *
 * Why Ably over Pusher/Supabase Realtime: this app isn't on Supabase (it's
 * Neon + its own auth), so Supabase Realtime would mean adopting a second
 * platform for one feature. Between Ably and Pusher Channels specifically,
 * Ably's free tier (200 concurrent connections, 6M messages/month) is
 * roughly double Pusher's free sandbox (100 connections, 200k/day) for a
 * feature whose connection count scales with concurrently-open chat
 * screens, not total users -- comfortable headway pre-launch, and the
 * per-match-channel model below scales the same way either provider.
 *
 * Only the server ever publishes (see publishNewMessage, called from
 * app/api/matches/[matchId]/messages/route.ts right after db.message.create).
 * Clients only ever get a SUBSCRIBE-only token, scoped to exactly one
 * match's channel per request (see createTokenRequest) -- never a
 * capability broad enough to publish into a channel, or to subscribe to a
 * match they're not part of. The per-channel scoping is re-checked by
 * app/api/realtime/auth/route.ts against the DB on every token request
 * (assertParticipant, the same authorization every other
 * /api/matches/[matchId]/* route uses), not inferred from anything the
 * client claims.
 */

let rest: Ably.Rest | null = null;
try {
  if (process.env.ABLY_API_KEY) rest = new Ably.Rest({ key: process.env.ABLY_API_KEY });
} catch {
  rest = null;
}

export const realtimeConfigured = rest !== null;

/** One channel per match, named so it's unmistakably not a public channel
 * even before capability is considered. */
export function matchChannelName(matchId: string): string {
  return `private-match-${matchId}`;
}

/**
 * Mints a short-lived Ably TokenRequest scoped to SUBSCRIBE-only on one
 * match's channel. The caller (app/api/realtime/auth/route.ts) must have
 * already verified userId is a current participant of matchId -- this
 * function trusts its inputs completely, it does no authorization itself.
 */
export async function createTokenRequest(userId: string, matchId: string): Promise<Ably.TokenRequest> {
  if (!rest) throw new Error('Ably is not configured (ABLY_API_KEY missing)');
  return rest.auth.createTokenRequest({
    clientId: userId,
    // 1 hour -- long enough that a chat session doesn't re-auth
    // constantly, short enough that a stale token can't outlive someone
    // being removed as a participant (unmatch/block) by much; the next
    // reconnect re-runs assertParticipant from scratch regardless.
    ttl: 60 * 60 * 1000,
    capability: { [matchChannelName(matchId)]: ['subscribe'] },
  });
}

/**
 * Publishes a newly-created message to its match's channel. Never
 * throws -- the message is already durably written to Postgres by the
 * time this is called (see the messages POST route); a failed publish
 * just means that one message relies on the chat screen's periodic
 * reconciliation poll to show up instead of arriving instantly. This is
 * a delivery-speed optimization on top of the database, not a second
 * source of truth.
 */
export async function publishNewMessage(matchId: string, message: unknown): Promise<void> {
  if (!rest) return;
  try {
    await rest.channels.get(matchChannelName(matchId)).publish('new-message', message);
  } catch (err) {
    console.error('[realtime] publish failed', err);
  }
}
