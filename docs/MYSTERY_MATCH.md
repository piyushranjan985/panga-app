# Mystery Match — Design Spec

Status: **Decided — built 2026-10-03** (names and mechanics confirmed by
PKR across chat; see §9 for the full decision trail)
Owner: Product / Platform
Related: `lib/mysteryMatch.ts`, `lib/matching.ts` (the discovery engine this
deliberately does NOT reuse, see §1), `app/api/cron/mystery-match/route.ts`,
`prisma/schema.prisma` (`Profile.mysteryCategory`, `MysteryMatchHistory`),
`docs/VYBE_VOUCH.md` (the other opt-in, advisory, non-gating social feature
this is built in the same spirit as), `docs/PUSH_NOTIFICATIONS.md`

## 0. What this is, in one paragraph

A standing daily preference, not a one-off action: every profile has a
`mysteryCategory` (**Mystery Match**, **Vybe Flip**, **No-Labels Match**, or
**Opted out**), shown as four buttons on the Profile screen, defaulting to
Mystery Match and changeable any time. Once a day, at 8:00pm IST, a cron job
pools everyone currently in each category (in the same city), pairs them up,
and creates a real match between each pair — both people are notified at the
same moment. The person shown is always someone that specific pair has never
crossed paths with before, in any form (never swiped, never matched, never
blocked, never a prior Mystery Match under any category) — that permanence
is what makes "mystery" mean something rather than being decorative. No
photo or full name is shown until both people mutually tap "Reveal" in chat.
The app suggests meeting in public, never organizes or books anything.

## 1. Why this isn't just `lib/matching.ts` with different numbers

Discovery ranking answers "rank THIS viewer's candidates, right now, for a
feed." Mystery Match answers a structurally different question: "take the
WHOLE day's opted-in pool for one category and pair it once." That's a
batch/one-shot problem, not a per-viewer ranking problem — doing it as a
batch (rather than "find one candidate the instant someone clicks a button,"
the original design before PKR revised it) is what lets the pairing be
computed over the full pool at once instead of first-come-first-served. See
`lib/mysteryMatch.ts`'s file comment for the long version. The three
categories:

- **Mystery Match** — same intent, same city, otherwise close to random (a
  light recency nudge only). The plain option: just someone genuinely new.
- **Vybe Flip** — same intent, same city, but the scoring is `lib/vibeMatch.ts`'s
  whole premise inverted: LOWEST shared interests/tribes wins, not highest.
  "You two have almost nothing in common on paper — curious what happens?"
- **No-Labels Match** — DIFFERENT intent, same city. Deliberately crosses
  the wall `lib/matching.ts`'s `INTENT_COMPATIBILITY` matrix otherwise
  enforces (Just Vibing × Rishta Ready scores 0 there — never shown to each
  other in ordinary discovery). All three intents are in scope, Rishta Ready
  included — see §2 for why that's safe here specifically.

## 2. The consent model (why this is safe to build)

Two separate things make this a meaningfully different safety situation
from "a random dating-app matching algorithm nobody fully understands":

**Nobody lands in a pool without choosing to be there, that day.** Unlike
ordinary discovery (on by default, intent-filtered automatically), a Mystery
Match pairing only happens between two people who *both* currently have the
*same* category selected. Two people choosing No-Labels Match today both
know, right now, that they're opting into a cross-intent wildcard today —
nobody is exposed to a mismatched-expectations pairing passively. This is
specifically why No-Labels Match is allowed to include Rishta Ready at all:
the risk that mattered (a marriage-minded person being randomly, silently
exposed to a casual-only pairing) doesn't apply once it's something both
sides deliberately picked that day.

**Mutual selection on the same day already IS the mutual consent.** Because
both people chose the same category independently, a real chat-enabled
`Match` row is created directly on pairing — there's no separate "does the
other person also want this specific pairing" step needed, the same way an
ordinary mutual swipe becomes a match immediately. The one-time explainer
below is about understanding what you're choosing, not approving each day's
specific pairing.

**One-time explainer for No-Labels Match.** The first time anyone selects
it (`Profile.mysteryNoLabelsAckAt` is null), the Profile screen shows a
short modal before saving the selection: you may be matched with someone
looking for something different than you are; it's meant as a fun, low-
stakes one-off, not a signal about what either of you wants long-term.
Confirming sets `mysteryNoLabelsAckAt` once, permanently — it's a "seen it"
marker, never re-asked.

**Everything else about trust & safety is inherited, not rebuilt.** The
cron's candidate pool uses the exact same account-health filters as
`app/api/discover/route.ts` (`status: ACTIVE`, not `discoveryRestricted`,
not `profileHidden`, `quietMode` off). Report/block during or after a
Mystery Match works exactly like any other match — nothing new to build
there. The app still never organizes or books a meetup, same stance as
every other date-adjacent feature here.

**What's deliberately NOT built (yet).** No curated "safe public venue"
suggestion list, no Vybe-Vouch-style trusted-contact check-in extension for
a Mystery Match meetup specifically. Both are natural extensions once this
ships and gets real usage — not required for a safe v1, since the trust
floor above already applies, and nothing here pushes anyone toward meeting
in person harder than ordinary matches already do.

## 3. Data model

```prisma
enum MysteryCategory {
  MYSTERY_MATCH
  VYBE_FLIP
  NO_LABELS
  OPTED_OUT
}
```

On `Profile`:
- `mysteryCategory: MysteryCategory @default(MYSTERY_MATCH)` — never
  defaults to `OPTED_OUT`; that's reachable only by explicit user choice.
- `mysteryCategorySetAt: DateTime @default(now())` — bumped ONLY when the
  value actually changes (re-saving the same value never resets the clock).
  Drives the 7-day auto-rotation (§4).
- `mysteryNoLabelsAckAt: DateTime?` — set once, first time No-Labels Match
  is selected, after the explainer. Never reset.

`MysteryMatchHistory` — one row per pair ever paired by the cron, in ANY
category, forever. `@@unique([userAId, userBId])` with `userAId < userBId`
(same ordering convention as `Match`). This table, together with `Match`,
`Swipe`, and `Block`, is the entire "never show this pair to each other
again" enforcement — see §5.

## 4. The 7-day auto-rotation

If `mysteryCategorySetAt` is 7+ days old AND the current category isn't
`OPTED_OUT`, the cron advances it one step: Mystery Match → Vybe Flip →
No-Labels Match → Mystery Match → … (`nextRotationCategory()` in
`lib/mysteryMatch.ts`). This runs as step 1 of the daily cron, before that
day's pools are built, so a just-rotated selection is used immediately for
that same day's run. `OPTED_OUT` is excluded from the query entirely —
rotation never touches it in either direction. Someone who opts out stays
opted out until they personally change it; inaction never reopens it.

## 5. The daily batch (8:00pm IST)

`app/api/cron/mystery-match/route.ts`, triggered by `vercel.json`'s
`"30 14 * * *"` (14:30 UTC = 8:00pm IST year-round — India has no DST, so
this fixed offset never drifts). Same `CRON_SECRET` bearer-auth pattern as
the existing `date-feedback-nudge` cron.

1. Auto-rotate stale selections (§4).
2. Build one combined exclusion set, pair-keyed (`a:b`, `a < b`), from:
   every `MysteryMatchHistory` row ever (any category), every `Match` row
   ever (current or past), every `Swipe` row either direction, every
   `Block` row either direction. This is deliberately broader than "never
   repeat a Mystery Match" — it's "never suggest someone you've already
   crossed paths with in any way," which is what actually makes the
   mystery mean something.
3. Fetch the eligible pool once (same account-health filters as discovery,
   `mysteryCategory != OPTED_OUT`), split by category.
4. For each category, run `matchMysteryPool()` (`lib/mysteryMatch.ts`) — a
   one-shot greedy pairing: score every remaining eligible pair, take the
   highest-scoring pair, remove both people, repeat. Not a true stable-
   matching solve — deliberately not worth the complexity for an opt-in
   pool that's expected to stay modest-sized for a while, same "good
   enough, not scientific" stance `lib/vibeMatch.ts` already takes.
5. For each resulting pair: upsert a real `Match` row (ordered pair, same
   as `app/api/swipe/route.ts`), upsert a `MysteryMatchHistory` row (so a
   retried/duplicate cron run or any future day can never re-suggest this
   pair), then push `push.mystery_match` to both sides via the existing
   `matchesMessages` notification category (no new toggle — a Mystery
   Match pairing IS a new match, same category fits).

**Dry days.** A category with fewer than 2 eligible people that day simply
produces zero pairs — no error, no special-cased notification. Worth
watching in practice: Vybe Flip and especially No-Labels Match are
genuinely opt-in every day (unlike Mystery Match's default-on pool), so
early on, in one city, some days will have nobody to pair for them.

## 6. API surface

- `PATCH /api/profile` — now also accepts `mysteryCategory` (one of the 4
  enum values) and `mysteryNoLabelsAck: true`. The handler only bumps
  `mysteryCategorySetAt` when the category actually changes, and sets
  `mysteryNoLabelsAckAt` whenever `mysteryNoLabelsAck` is sent — both can be
  sent together in one request (selecting No-Labels Match for the first
  time, right after confirming the explainer).
- No new read endpoint — `GET /api/profile` already returns the whole
  profile, `mysteryCategory`/`mysteryNoLabelsAckAt` included.
- `POST /api/matches/[matchId]/reveal` — the blind-reveal mechanic itself
  (see §8). One-way: sets the caller's own `Match.revealedAAt`/`revealedBAt`
  if not already set, never un-sets it. 400s on a match where
  `isMysteryMatch` is false. Returns the pair's `revealStatus`.
- `GET /api/matches/[matchId]/partner` and `GET /api/matches` both now also
  return `revealStatus` (`isMysteryMatch`/`myRevealed`/`partnerRevealed`/
  `fullyRevealed`), and mask `displayName`/`age` to `"Mystery Match"`/`null`
  for an unrevealed Mystery Match pairing — see §8.

## 7. Where this shows up in the product

One new card on the Profile screen ("🎭 Mystery Match"), four buttons in a
2×2 grid, active selection highlighted, changeable any time. The one-time
No-Labels explainer is a modal, same visual pattern as `MatchModal`
(`fixed inset-0 ... bg-ink/60 backdrop-blur-sm`). The pairing notification
at 8pm — "Your Mystery Match is here 🎭 — Say hi to {{name}}" — lands
exactly like any other new-match push, opening straight into the new
match's chat, where the blind-reveal banner (see §8) is now the first
thing shown.

## 8. The blind reveal mechanic (built)

The part that actually makes a Mystery Match "blind," not just a
differently-sourced ordinary match.

- **Schema** — `Match` gained `isMysteryMatch` (set once, at creation, by
  the daily batch; always `false` for an ordinary swipe match and never
  changed afterward), `mysteryCategory` (display only — which category
  produced it), and `revealedAAt`/`revealedBAt` (one nullable timestamp per
  side). A match is "fully revealed" the moment both are non-null.
- **Reveal action** — `POST /api/matches/[matchId]/reveal` (see §6). Each
  side taps "👀 Reveal" independently; tapping only ever moves *your own*
  timestamp from null to `now()` — there's no un-reveal, and no way to see
  it coming back. Idempotent: tapping twice, or after you've already
  revealed, is a no-op.
- **Masking rule** — while `isMysteryMatch` is true and the pair isn't
  fully revealed, `GET /api/matches/[matchId]/partner` masks
  `displayName` to `"Mystery Match"`, `age` to `null`, AND `photoUrl` to
  `null` -- all three, server-side, not just hidden in the UI, so the
  real values never reach the client (and can't be read out of a network
  inspector) before mutual reveal. `GET /api/matches` masks `displayName`
  the same way for the matches list (it never selected photos to begin
  with). `avatarSeed`/`avatarHue` are left alone either way -- a letter
  and a hue aren't identifying, and the client needs them to draw the
  placeholder glyph.
- **Where the photo actually turns on** — the chat header and Match
  Profile panel always render the `avatarSeed`/`avatarHue` glyph for an
  ordinary match (a pre-existing, unrelated simplification -- only the
  pre-match discover card renders a real `<img>` there). For a Mystery
  Match pairing specifically, the glyph IS the blind-reveal placeholder:
  the client only swaps it for the real photo once `revealStatus.
  fullyRevealed` is true AND `partner.photoUrl` is non-null (which it
  only ever is, for this pairing, once revealed).
- **Chat UI** — a banner at the top of the message list, shown only while
  `revealStatus.isMysteryMatch && !revealStatus.fullyRevealed`, with
  state-dependent copy ("hidden until you both choose to reveal" / "you've
  revealed, waiting for them" / "they're ready, tap to reveal too") and a
  "👀 Reveal" button when this side hasn't tapped it yet.
- **Notification on mutual reveal** — `push.mystery_reveal` fires to BOTH
  sides, but only the instant `fullyRevealed` flips from false to true
  (i.e. only on the *second* tap, never the first). A one-sided reveal
  notifies no one — deliberately, so revealing first can never telegraph
  to the other person that they're "being waited on," which would turn a
  mutual, pressure-free choice into a one-sided nudge.

## 9. What's explicitly deferred, not forgotten

- A curated per-city "safe public venue" suggestion list.
- A Vybe-Vouch-style trusted-contact check-in extension for a Mystery Match
  specifically ("heads up, meeting someone Friday, [neighborhood]" +
  automatic "get home okay?" follow-up).
- Any monetization lever (more than one pick a day, unlocking a category as
  a paid perk) — deliberately not considered until there's real usage data.

## 10. Decision trail (chat, 2026-10-03)

- Names: **Mystery Match**, **Vybe Flip**, **No-Labels Match** (over
  Chalk & Cheese Match, Wildcard Match, Curveball Match — kept for the
  record in chat history, not reused elsewhere).
- Model: daily STANDING preference + 8pm batch notification (not a
  click-to-reveal-instantly button) — chosen specifically because it
  enables real batch pairing quality and a genuinely simultaneous reveal
  for both people, which a pure pull/click model can't guarantee.
- Default: Mystery Match (never Opted out) for a profile that's never
  touched this; 7-day inactivity auto-rotates Mystery Match → Vybe Flip →
  No-Labels Match → Mystery Match, never into Opted out; Opted out is
  reachable only by explicit choice and stays sticky until changed.
- No-Labels Match includes Rishta Ready (reversing an earlier, more
  conservative draft that excluded it) — justified by the consent model in
  §2 once the design moved from "default-ish exposure" to "both sides
  actively chose this pool today."
- Blind reveal is one-way and mutual-only: tapping Reveal can't be undone,
  and the push notification fires only once both sides have revealed —
  never on a one-sided tap — specifically so revealing first never signals
  to the other person that they're expected to reciprocate.
