# Wild Card — Design Spec

Status: **Decided — built 2026-10-04** (direction approved by PKR in
chat as "go ahead," after a brainstorm that started from a proposed
"Mismatch" button; see §8 for the decision trail)
Owner: Product / Platform
Related: `lib/matching.ts` (`scoreWildCardCandidate`/`rankWildCardCandidates`
-- the discovery engine this reuses almost entirely, see §1),
`lib/wildCard.ts`, `lib/discoverPool.ts`, `lib/istTime.ts`,
`app/api/discover/wildcard/route.ts`, `prisma/schema.prisma`
(`WildCardUse`), `docs/MYSTERY_MATCH.md` (the other "deliberately low
overlap" feature this is distinguished from throughout, see §2)

## 0. What this is, in one paragraph

A button on the Discover screen, next to the ranked feed, not instead of
it: "🃏 Wild Card." Tapping it pulls one card, live, right now — same
city, same dating intent as everything else in Discover, but scored for
having the *least* in common with the viewer, not the most. The card
drops straight into the normal swipe stack; swiping it is identical to
swiping any other profile (same `/api/swipe` call, same match flow). Up to
2 pulls a day, resetting at 8:00pm IST. No new screen, no new tab, no new
notification type — Wild Card lives entirely inside Discover.

## 1. Why this reuses `lib/matching.ts` instead of `lib/mysteryMatch.ts`

The original ask was "an Option button in Discover... same intent, based
on opposite likes, max 2/day" — a live, per-viewer, on-demand pick. That's
structurally `lib/matching.ts`'s problem (rank THIS viewer's candidates,
right now, for a feed), not `lib/mysteryMatch.ts`'s (pair the WHOLE day's
pool once, in a batch, for a scheduled moment — see
`docs/MYSTERY_MATCH.md` §1). So Wild Card gets two new functions
alongside the existing ones in `lib/matching.ts` — `scoreWildCardCandidate`
and `rankWildCardCandidates` — rather than a third pairing category bolted
onto Mystery Match's batch engine. Concretely:

- **Eligibility floor is reused UNCHANGED.** `isEligibleCandidate` — same
  gender compatibility, same `INTENT_COMPATIBILITY` floor, same
  `hasLocationPath` distance rule — is called as-is, not duplicated or
  loosened. A Wild Card is still someone the viewer could actually match
  and go meet: same city, compatible intent, not blocked, not
  quiet-mode. Nothing about "opposites attract" is allowed to override a
  real deal-breaker.
- **Exactly one scoring term is flipped: shared interests.**
  `scoreCandidate`'s `+sharedInterests * WEIGHTS.sharedInterest` becomes
  `scoreWildCardCandidate`'s `-sharedInterests * WEIGHTS.sharedInterest *
  2` — negative, and weighted twice as heavily so it's the dominant signal
  in the ranking, not a tiebreaker. City/intent/proximity/recency terms
  are copied verbatim. This was a deliberate call against "invert
  everything" (distance, recency, all of it) — maximizing distance or
  surfacing a long-inactive profile has nothing to do with "opposites
  attract" and would just make the card worse, not more interesting.

## 2. Why this isn't "Vybe Flip, but a button" (the naming problem)

Vybe Flip (one of Mystery Match's three categories, see
`docs/MYSTERY_MATCH.md` §1) already does "same intent, same city, lowest
shared-interest overlap wins." The brainstorm's original worry — "it
shouldn't be exactly like Vybe Flip" — is handled by delivery mechanics
being genuinely different, not by the scoring idea being different (it's
fine for two features to independently land on "fewer shared interests is
the interesting signal here"; that's just what "opposites attract" means
mechanically):

|                      | Vybe Flip (Mystery Match)              | Wild Card                          |
| -------------------- | --------------------------------------- | ----------------------------------- |
| When it happens      | Once a day, 8:00pm IST, scheduled       | Any time, on tap, instant           |
| What you get         | A real match immediately, blind         | One swipeable card in your feed     |
| Consent shape        | Standing daily preference (§2 of that doc) | A fresh choice each tap            |
| Reveal               | Blind until mutual reveal                | Normal — full photo/name right away |
| Quota                | Implicit (one preference, one slot/day) | Explicit: 2 pulls/day, shown on the button |

Renamed from "Mismatch" to **Wild Card** during the brainstorm — "Mismatch"
reads like a flaw in the matching system; "Wild Card" reads like a
deliberate, fun thing to draw.

## 3. The quota and daily reset

`WILD_CARD_DAILY_LIMIT = 2` (`lib/wildCard.ts`). Resets at IST midnight —
the same `startOfTodayIST` boundary Mystery Match's cron uses, pulled out
into `lib/istTime.ts` so there's exactly one definition of "what day is it
in India right now" shared by both features (see that file's comment for
why a fixed +5:30 offset is safe: India has no DST).

A pull only counts against the quota the moment a real card is actually
handed back (`WildCardUse` row written in the same request that returns
the card). A request that comes back empty — nobody eligible left today —
costs nothing, same as ordinary Discover never penalizing a viewer for a
thin pool.

## 4. Data model — `WildCardUse`, no `Swipe`/`Match` changes

One new table, one row per card actually delivered:

```prisma
model WildCardUse {
  id              String   @id @default(cuid())
  userId          String
  candidateUserId String
  createdAt       DateTime @default(now())
  // + relations to User, @@index([userId, createdAt])
}
```

That single table does three jobs, which is why nothing on `Swipe` or
`Match` needed to change:

1. **Daily quota** — `count` of rows for `userId` since IST midnight.
2. **Same-day no-repeat** — today's `candidateUserId`s are excluded from
   today's pool, so two pulls in the same day can't hand back the same
   unswiped person (ordinary Discover's "already swiped" exclusion
   doesn't cover a card that was shown but never acted on).
3. **One-sided match-screen attribution** (see §6) — a plain existence
   check on `(userId = me, candidateUserId = them)`.

Swiping on a Wild Card-sourced card uses the exact same
`POST /api/swipe` endpoint as any other card — no branch, no special
case. The match it can create is an entirely ordinary `Match` row.

## 5. The endpoint

`GET /api/discover/wildcard` (`app/api/discover/wildcard/route.ts`) — a
GET with a side effect, same non-RESTful shape the rest of `/api/discover`
already uses when "fetching" and "spending something" are the same action
from the user's point of view:

1. 401/403/409 the same way `/api/discover` does (auth, account
   enforcement, finished onboarding).
2. Check `wildCardQuota` — 403 with `remaining: 0` if the viewer is out
   for the day.
3. Build the exclusion set: already swiped + blocked both directions +
   today's `WildCardUse` candidates.
4. Rank the viewer's eligible candidate pool (shared with ordinary
   Discover via `lib/discoverPool.ts` — same cached pool, same 45s TTL,
   just two different scoring functions) with `rankWildCardCandidates`.
   As of the discovery-scale rewrite, that pool is no longer "everyone
   in the city": it's SQL-filtered by gender/lookingFor/intent/distance-
   or-city first (cached per city+gender+lookingFor+intent+grid-cell,
   not just per city — see lib/geo.ts's `gridCellFor`), so it stays
   relevant instead of arbitrary once a city has far more profiles than
   any one request needs to rank.
5. Take the top result. None left → 404, quota untouched (see §3).
6. Fetch full profile detail for the winner, write the `WildCardUse` row,
   return `{ card, remaining, limit }`. `card` is shaped exactly like a
   normal feed item plus `isWildCard: true`.

`GET /api/discover`'s response `meta` also carries `wildCard: { limit,
used, remaining }` — just a count, computed the same way — so the
Discover page's button can show "(N left)" without a separate request.

## 6. Where this shows up in the product

- **Discover screen** — a "🃏 Wild Card (N left)" button above the ranked
  feed. Tapping it inserts the returned card directly after whatever the
  viewer is currently looking at, so it shows up next without losing their
  place in the normal feed. Disabled at 0 remaining.
- **The card itself** (`components/VibeCard.tsx`) — identical mechanics
  (blurred prompts/interests to unlock, swipe to Pass/Vybe) plus a small
  "🃏 Wild Card" ribbon, and `matchReasons` framed as "Why this is your
  Wild Card" instead of "Why you might click" — e.g. "nothing in common on
  paper," "same city," "same intent."
- **Match screen, one-sided only** — if a match came from a card the
  viewer drew as a Wild Card, `GET /api/matches/[matchId]/partner` returns
  `matchMeta.foundViaWildCard: true` for that viewer (and only that
  viewer — the check is `userId = me`, never symmetric). The chat screen
  shows a small, dismissible one-liner: "🃏 You found this match with a
  Wild Card — almost nothing in common on paper." The other person sees
  nothing different; there's no inference for them to make, since from
  their side this is just an ordinary match.

## 7. What's explicitly deferred, not forgotten

- Raising/lowering the daily limit, or any monetization lever (more pulls
  as a paid perk) — no usage data yet to justify either direction.
- A dedicated "Wild Card" filter/tab on the matches list.
- Letting a viewer re-roll a specific pull within the same day (today:
  one pull = one card, swipe or don't, it still counts).

## 8. Decision trail (chat, 2026-10-04)

- Started from a proposed "Mismatch" button ("same intent, opposite likes
  based, max 2/day, shouldn't be exactly like Vybe Flip"); renamed to
  **Wild Card** — "Mismatch" reads like something broken, not something
  fun to draw.
- Live/on-demand inside normal Discover, not a scheduled blind batch —
  the opposite choice from Mystery Match's model, made deliberately so
  the two features stay genuinely different in *shape*, even though both
  use a low-shared-interest signal (see §2's table).
- Eligibility floor reused unchanged from ordinary discovery; only the
  shared-interest scoring term is flipped and doubled — not a "maximum
  distance on everything" inversion, so a Wild Card never surfaces
  someone incompatible on an actual deal-breaker (wrong city, wrong
  intent, out of range).
- No `Swipe`/`Match` schema changes — a single new `WildCardUse` table
  covers quota, same-day no-repeat, and one-sided attribution at once.
