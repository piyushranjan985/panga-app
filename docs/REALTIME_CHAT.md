# Realtime Chat Delivery — Design Spec

Status: **Decided — built 2026-10-08**
Owner: Platform
Related: `lib/realtime/ably.ts`, `app/api/realtime/auth/route.ts`,
`app/api/matches/[matchId]/messages/route.ts`, `app/matches/[matchId]/page.tsx`,
`app/api/matches/[matchId]/heartbeat/route.ts`, `lib/notifications/push.ts`
(`isChatOpenRecently` -- a separate, pre-existing concern this work does
not touch)

## 0. What this is, in one paragraph

Chat used to be pure polling: the open chat screen fetched `/messages`
every 4 seconds, full stop, on every single open chat screen, forever.
Fine at dev scale, expensive at the scale this app is built for (millions
of profiles per city -- see the discovery-pool rewrite in the same commit
history for the same reasoning applied elsewhere). Vercel serverless
functions can't hold a persistent connection themselves, so "do realtime"
here means a managed pub/sub service sitting next to Postgres, not a
custom WebSocket server. This is that: Ably Channels, reached over plain
HTTPS from the server (publish) and a WebSocket client SDK in the browser
(subscribe) -- no change to the DB layer, no custom server, nothing to run
ourselves.

## 1. Why Ably over Pusher Channels / Supabase Realtime

- **Supabase Realtime**: this app isn't on Supabase -- it's Neon Postgres
  with its own auth layer. Adopting Supabase Realtime would mean running a
  second platform for exactly one feature. Ruled out on that basis alone.
- **Pusher Channels**: free/sandbox tier is 100 concurrent connections and
  200,000 messages/DAY. Ably's free tier is 200 concurrent connections and
  6,000,000 messages/MONTH. Connection count here scales with concurrently
  *open chat screens*, not total users, so headroom matters more than raw
  message volume -- Ably's free tier is roughly double the connection
  headroom with a far more generous message cap, for the same per-match-
  channel design either provider would use. Pusher's cheapest paid tier
  ($49/mo) isn't needed yet on either count.
- **Ably**: chosen. (Pricing checked 2026-10-08; re-check before either
  provider's free tier is actually at risk of being exceeded.)

## 2. Architecture

- **One channel per match**: `private-match-{matchId}` (see
  `matchChannelName()` in `lib/realtime/ably.ts`). Not one global channel,
  not one per user -- a match's two participants are the only audience for
  its messages, so the channel boundary *is* the authorization boundary.
- **Server publishes, never the client.** `app/api/matches/[matchId]/
  messages/route.ts`'s POST handler calls `publishNewMessage(matchId,
  message)` right after `db.message.create(...)` succeeds -- Postgres is
  still the only source of truth; the publish is a delivery-speed
  optimization on top of it, not a second one. `publishNewMessage` never
  throws (same "ships before configured" pattern as `lib/cache.ts`'s
  Upstash wrapper) -- a failed or absent publish just means that one
  message relies on the client's fallback poll instead of arriving
  instantly.
- **Clients only ever get a SUBSCRIBE-only, single-channel token.**
  `app/api/realtime/auth/route.ts` is the Ably client SDK's `authCallback`
  target: it re-runs `assertParticipant(matchId, userId)` (the same check
  every other `/api/matches/[matchId]/*` route uses) on every single token
  request, then calls `createTokenRequest()`, which mints a TokenRequest
  whose `capability` is exactly `{ "private-match-{matchId}": ["subscribe"] }`
  and whose TTL is capped at 1 hour. A client can never publish, and can
  never subscribe to a match it isn't currently a real participant of --
  that's checked against the database on every request, never inferred
  from anything the client claims (a stale/forged matchId in the request
  body just gets a 404, same as any other route using `assertParticipant`).
- **The Ably API key never reaches the browser.** It's read server-side
  only, inside `lib/realtime/ably.ts`'s `Ably.Rest` client; the browser
  only ever holds the short-lived TokenRequest described above.

## 3. Fallback behavior (the point of the whole design)

Ably is entirely optional, same stance as every other integration in this
codebase (Upstash Redis, QStash, FCM): unset `ABLY_API_KEY` and nothing
breaks --

- `realtimeConfigured` is `false`, so `/api/realtime/auth` answers 503.
- The chat page's Ably client fails to connect (once -- Ably does not
  keep retrying after an auth failure), `realtimeConnected` stays `false`.
- The message-poll `useEffect` in `app/matches/[matchId]/page.tsx` reads
  `realtimeConnected` and keeps the original 4-second cadence whenever
  it's `false` -- unconfigured, still connecting, or dropped mid-session
  all look the same to this logic: poll fast.
- The moment a real connection is live, that same poll slows to 30
  seconds -- a reconciliation safety net (a missed event, a brief
  connection blip, a message that landed while Ably was down) rather than
  the primary delivery path.

Nothing about this needs an Ably account to exist before merging, and
nothing about it needs touching again once one does -- setting
`ABLY_API_KEY` in Vercel (Preview and Production, separately, same as
every other provider credential in `.env.example`) is the entire
activation step.

## 4. Deliberately NOT touched by this work

`Match.chatOpenAAt`/`chatOpenBAt` and `isChatOpenRecently()`
(`lib/notifications/push.ts`) are a separate mechanism -- they suppress a
push notification when the recipient's chat screen is already open, on a
15-second trust window. They used to piggyback on the same 4-second poll
this work slows down; that coupling is now broken out into its own
independent 10-second interval (see the chat page's dedicated heartbeat
`useEffect`) specifically so slowing the message poll for a realtime-
connected client can't let that trust window go stale. The push-
suppression behavior itself is unchanged.

## 5. Idle shutdown (added 2026-10-08)

A tab that's open but abandoned -- backgrounded, or just not touched --
used to keep paying full price forever: the message poll, the heartbeat,
and (once Ably is configured) the realtime connection all ran at their
normal cadence regardless of whether a human was actually looking.
`app/matches/[matchId]/page.tsx` now tracks one `isIdle` flag, shared by
all three:

- **Triggers:** 5 minutes with no mousemove/keydown/touchstart/scroll/
  click, OR the tab going to the background (`document.visibilityState
  === 'hidden'` fires immediately, no reason to wait out the timer for an
  unambiguous signal).
- **While idle**, all three stop completely, not just slow down: the
  message poll doesn't schedule at all, the heartbeat doesn't fire (see
  below for why that's correct, not just cheaper), and the Ably
  connection closes.
- **On resume** (any activity, or the tab becoming visible again), all
  three restart immediately -- the poll effect's first call to `load()`
  on restart is also the "catch up on whatever arrived while idle" step,
  for free, since nothing was lost: messages are durable in Postgres
  regardless of whether anyone was subscribed to hear about them live.

Two different motivations, not one:

- **Cost.** An idle tab was still generating the same recurring load as
  an actively-watched one -- the same poll/heartbeat requests against
  Vercel+Neon, and, once Ably is on, the same billed connection-minutes.
  None of that was buying anything for a tab nobody's looking at.
- **Correctness.** The heartbeat is what keeps `chatOpenAAt`/`chatOpenBAt`
  fresh for `lib/notifications/push.ts`'s `isChatOpenRecently()` 15s
  trust window, which exists to suppress a push when you're already
  looking at the conversation. Before this, "mounted" and "present" were
  treated as the same thing -- someone who left a chat tab open on their
  desk for an hour and stepped away would never get push-notified about a
  new message, because the heartbeat kept firing regardless of whether
  they were actually there. Idle detection fixes that: walk away for 5
  minutes and the heartbeat stops, the trust window lapses, and a new
  message correctly reaches them as a push again.

Nothing here ends the match or the conversation -- "idle" is purely a
client-side connection/presence state for this one tab. The conversation
itself is untouched; reopening or returning to the tab picks up exactly
where it left off.

## 6. Scaling note

Connection count is bounded by concurrently open chat screens, not total
users or total messages -- a user who isn't currently looking at a chat
holds no Ably connection at all. This is the same shape of design
decision as the discovery-pool rewrite elsewhere in this codebase: don't
let a number that grows with total userbase size (millions per city) sit
directly on a per-request or per-connection cost; let it sit on something
that stays small (one open chat screen per active conversation) instead.
