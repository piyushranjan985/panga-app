# Vybe Vouch — Design Spec

Status: **Decided — ready for implementation** (open questions resolved
2026-10-02, see §6)
Owner: Product / Platform
Related: `lib/matchSignals.ts`, `lib/vybeContent.ts`, `lib/matchAuthz.ts`,
`app/api/preview/[userId]/route.ts` (Family Preview — the closest existing
feature, see §0), `prisma/schema.prisma` (`FeatureFlag`, `Match`,
`Profile.familyPreviewOn`)

## 0. What this is, in one paragraph

A per-match, opt-in, one-shot invite: either person in a match can generate a
private link inviting ONE trusted person they already know — a best friend,
a parent, whoever — to look at a privacy-safe summary of *that specific
match* and react with a light "good vibe / ask more / something's off," plus
an optional one-line note. Only the inviter ever sees the response. The
vetter needs no account. The other match participant never knows an invite
happened. It never blocks anything — purely advisory. This operationalizes
the product's actual tagline ("not a swipe app, not a shaadi site") as a
mechanic instead of just a vibe: Tinder/Bumble have zero social-accountability
layer, matrimony sites make family involvement mandatory and controlling;
this sits in between, optional and non-binding either way.

**Not the same feature as:**
- The existing in-chat "⚡ Vybe" tap-prompts (`lib/conversationStarters.ts`) —
  those are icebreaker questions between the two matched people. Different
  mechanic entirely; naming this "Vybe Vouch" (not "Vybe Check") specifically
  avoids colliding with that existing feature's internal naming.
- `Profile.familyPreviewOn` ("Family Preview") — an existing always-on,
  profile-level, no-feedback public link a user can turn on to let anyone
  with the link see a curated read-only summary of *their own* profile.
  Vybe Vouch is match-level, one-time-invite, and produces a response the
  inviter sees — a different shape, but §2 deliberately reuses Family
  Preview's unauthenticated-token-endpoint pattern rather than inventing a
  new one, same "one system, not two" principle as
  `docs/IDENTITY_VERIFICATION_AND_SAFETY.md`.

## 1. Guardrails (non-negotiable, stated up front)

These are the constraints that keep this feature from drifting into the
"family controls your dating life" dynamic the product is explicitly
positioned against. Any implementation detail below that conflicts with one
of these is wrong, not a shortcut:

1. **Advisory only, never gating.** A 🚩 "something's off" reaction never
   blocks messaging, never appears to the other match participant, and is
   never read by `lib/matching.ts` or `lib/vibeMatch.ts`. It is purely a
   private note shown back to the one person who asked for it.
2. **No contact harvesting.** The app never collects the vetter's phone
   number or email. The inviter shares the link themselves, however they
   already would (WhatsApp, SMS, in person). This keeps the feature from
   becoming a disguised contact-import channel and keeps DPDP exposure to
   "an optional free-text note someone chose to write," nothing more.
3. **The vetted person is never told.** The other match participant has no
   visibility into whether an invite exists, who it went to, or what was
   said. This mirrors how people already do this informally — you don't
   announce "I'm texting my mom about you" — and keeps this from reading as
   a surveillance feature.
4. **One response per invite, consumed on first answer.** A link can't be
   forwarded and farmed for multiple opinions under one invite; "who said
   what" stays unambiguous for the inviter.
5. **Same content-safety filtering as everywhere else.** Only
   `moderationStatus: 'APPROVED'`, non-removed photos can appear through
   this path — identical rule to `app/api/preview/[userId]/route.ts` and
   `app/api/discover/route.ts`. No new photo-exposure surface gets a weaker
   filter than the rest of the app.

## 2. Data model

Two new models, additive — no changes to `Match` or `Profile`:

```prisma
model VybeVouchInvite {
  id            String    @id @default(cuid())
  matchId       String
  match         Match     @relation(fields: [matchId], references: [id], onDelete: Cascade)
  inviterUserId String
  inviter       User      @relation(fields: [inviterUserId], references: [id], onDelete: Cascade)
  // Opaque, unguessable — the link itself is the credential, no account
  // needed by the vetter. @default(cuid()) here (not uuid) only because
  // cuid() is already this schema's house style for every other id.
  token         String    @unique @default(cuid())
  // Inviter's own free-text label for who this is going to ("Best friend
  // Rhea", "Mom") — shown ONLY to the inviter, never to the vetter or the
  // match. Length-capped in the route handler, not the schema.
  vetterLabel   String
  expiresAt     DateTime  // short-lived; see §6 for the proposed default
  consumedAt    DateTime? // set the moment a response is submitted — link
                           // becomes a static "already answered" page after
  revokedAt     DateTime? // inviter can cancel an unused invite
  createdAt     DateTime  @default(now())

  response VybeVouchResponse?

  @@index([matchId])
  @@index([inviterUserId])
}

model VybeVouchResponse {
  id        String          @id @default(cuid())
  inviteId  String          @unique
  invite    VybeVouchInvite @relation(fields: [inviteId], references: [id], onDelete: Cascade)
  reaction  String          // 'GOOD_VYBE' | 'ASK_MORE' | 'NO_STRONG_OPINION' | 'FLAGGED'
  note      String          @default("") // optional, length-capped in the route handler
  createdAt DateTime        @default(now())
}
```

Why two models instead of one row with nullable response columns: an invite
genuinely has two independent lifecycle moments (created, then — maybe —
answered), and splitting them makes "has this been answered" a plain
null-check, makes the response a one-time immutable write (no silent edits
to a verdict after the fact, which matters if this is ever looked at during
a dispute/report review), and keeps `VybeVouchResponse` trivially
`@@unique([inviteId])`-enforced at the database level rather than relying on
application logic alone.

## 3. API surface

### 3a. `POST /api/matches/[matchId]/vouch` — create an invite

Authenticated. Reuses `assertParticipant`/`otherUserId` from
`lib/matchAuthz.ts` exactly like every other match-scoped route
(`app/api/matches/[matchId]/messages`, `/unmatch`, `/block`, etc.) — no new
authorization pattern needed.

Request: `{ vetterLabel: string }` (trimmed, length-capped — e.g. 40 chars).
Response: `{ token: string, shareUrl: string, expiresAt: string }`.

Rate-limited per inviter per match (not just globally) — same shape as
`lib/otp.ts`'s `REQUEST_COOLDOWN_SECONDS`, e.g. no more than N pending
invites per match at once, and a cooldown between creating new ones. This
protects the vetter from being spammed with repeat links more than it
protects the match itself (the vetted person never sees any of this either
way).

`GET /api/matches/[matchId]/vouch` — lists the authenticated inviter's own
past invites + responses for this match, for the response-card UI (§5).
Only ever returns the caller's own invites, never the other participant's.

### 3b. `GET /api/vouch/[token]` — the vetter's view

Unauthenticated, token-keyed — modeled directly on
`app/api/preview/[userId]/route.ts`. Missing, expired, revoked, and
already-consumed all return the **same** "this link isn't available"
response (never a different error per case), so the endpoint can't be used
to probe invite state from outside.

Returns a privacy-safe projection of the OTHER match participant (not the
inviter — the vetter already knows the inviter personally, no need to show
their dating profile too):

```json
{
  "vouch": {
    "displayName": "...",
    "age": 0,
    "city": "...",
    "verification": "VERIFIED",
    "verificationIsMock": false,
    "photoUrl": "...",
    "pairIntent": "SOMETHING_REAL",
    "vibeSummary": {
      "matchExplanation": ["..."],
      "noStrongSignalText": "You both liked each other. That's a pretty good start. 💚"
    }
  }
}
```

**Correction made while writing this up:** the first draft of this spec
said `vibeSummary` would reuse `lib/vibeMatch.ts`'s percent-based narrative
("87% Vibe Match"). That generator is actually superseded —
`lib/matchSignals.ts`'s own header comment says the product spec bans
anything that reads as a manufactured compatibility score, and
`app/api/matches/[matchId]/vibe/route.ts` already replaced it everywhere
else. Fixed here before any code gets written: `vibeSummary` is built the
same way that route builds it — `toSignalProfile()` on both profiles,
`computeSharedSignals()` + `rankPositiveSignals()` from
`lib/matchSignals.ts`, then `getMatchExplanation()` from
`lib/vybeContent.ts` for the ready-to-render sentences (falling back to
`NO_STRONG_SIGNAL_TEXT` when `matchExplanation` is null). `pairIntent`
comes from that same file's `resolvePairIntent()` — see §9 for why that
function in particular matters here. Reuse, not reimplementation, same
principle as before, just pointed at the component that's actually live.
Everything else mirrors the fields `app/api/preview/[userId]/route.ts`
already exposes, plus `vibeSummary`, which Family Preview deliberately
omits (that route's own comment says "no Vybe Check prompt answers" for
the public always-on link — correctly more conservative, since that link
is unscoped/indefinite; a Vybe Vouch invite is one-shot, short-lived, and
explicitly sent to one named trusted person by the inviter themselves,
which is a different risk profile).

**Deliberately excluded**, same reasoning as Family Preview: bio free text,
full photo grid (one photo only), chat history, contact info, exact match
date.

### 3c. `POST /api/vouch/[token]` — submit a reaction

Unauthenticated. Body: `{ reaction: 'GOOD_VYBE' | 'ASK_MORE' | 'NO_STRONG_OPINION' | 'FLAGGED', note?: string }`
(`note` length-capped, e.g. 200 chars). Fails with the same generic
"unavailable" response if the invite is missing/expired/revoked/already
consumed. On success: creates `VybeVouchResponse`, sets `consumedAt`, returns
a simple "thanks" confirmation. A second `GET` after this point serves a
static "you've already answered this" page instead of the form.

## 4. Pages

- `app/vouch/[token]/page.tsx` — new, unauthenticated, outside-the-app page
  shell, directly mirroring `app/preview/[userId]/page.tsx`'s existing
  pattern (same "no login, works for anyone with the link" shape). Shows the
  safe summary, the four reaction buttons, optional note field, submit.
- No new admin page for MVP (see §7) — invite/response data is low-risk,
  ephemeral, and user-initiated, unlike `ModerationCase`/`Report` records
  which genuinely need admin review surfaces.

## 5. Where this shows up in the product

Chat screen (`app/matches/[matchId]/page.tsx`): the existing `panel` state
(`'none' | 'menu' | 'profile' | 'askAbout' | 'plan' | 'report' | 'safety' | 'dateFeedback'`)
gets one more value, e.g. `'vouch'`, entered from the existing options menu
alongside Mute / Report / Unmatch / Block (same spot those live today,
around line ~900-957). The panel: a short explainer, the `vetterLabel`
input, a "Get link" button that calls §3a and then uses the Web Share API
(`navigator.share`, with a copy-to-clipboard fallback for browsers without
it) so the inviter can send it through whatever app they'd already use —
WhatsApp most likely, which is exactly the right distribution channel for
this and needs zero new integration work.

Once a response comes back, a small card appears in that same panel (label
+ reaction + note) — this app has no push notifications yet (per the
`Match.mutedAAt` comment in the schema), so, consistent with how the rest of
the app already handles that gap, this is a poll/refetch-on-open affordance,
not a push alert. A future notification pass (if/when one gets built for the
app generally) would cover this for free rather than needing its own
one-off mechanism.

## 6. Decisions (confirmed by PKR, 2026-10-02)

1. **Which intents get this first:** Something Real **and** Rishta Ready
   both launch together (not Rishta Ready alone as originally proposed) —
   Just Vibing stays excluded at launch. Uses the existing `FeatureFlag`
   model (`rolloutPercent` + a per-intent check) — no new flagging
   infrastructure needed. See §9 for how this interacts with a match
   whose participants' intents don't match the launch set, or change
   after the match already exists.
2. **Invite expiry window:** 7 days — confirmed as proposed.
3. **Per-match invite cap:** 3 pending invites at once per person per
   match — confirmed as proposed.
4. **Reaction set:** four options, not three — 👍 Good vibe / 🤔 Ask more /
   😐 No strong opinion / 🚩 Something feels off. `NO_STRONG_OPINION` added
   to the enum in §2 and §3c. (Exact emoji/copy still placeholder-level —
   fine to bikeshed at build time, doesn't change the data model.)
5. **🚩 FLAGGED stays advisory-only, permanently:** confirmed. It does
   nothing beyond showing the inviter a private note — not now, not as a
   later addition. This is the guardrail in §1 that the rest of the
   feature's positioning depends on; treat any future proposal to make a
   flag "do more" as a proposal to change what this feature fundamentally
   is, not a small follow-up.

## 7. Rollout — status: built (2026-10-02)

Schema, both API routes, the unauthenticated vetter page, and the
chat-screen entry point + response card are all live in the codebase now
(see `lib/vybeVouch.ts`, `app/api/matches/[matchId]/vouch/route.ts`,
`app/api/vouch/[token]/route.ts`, `app/vouch/[token]/page.tsx`,
`app/matches/[matchId]/page.tsx`'s `'vouch'` panel) -- no separate
staged rollout mechanism. Revised from the original phased plan below:
`FeatureFlag` rows exist in the schema (and the admin Configuration page
can edit them), but nothing in the consumer app actually reads a
`FeatureFlag` at request time anywhere yet -- `NotificationTemplate` was
the same story until this very pass wired it in for push (see
`docs/PUSH_NOTIFICATIONS.md` §8). Gating this behind a flag would mean
building that read-path for the first time just for this feature, which
wasn't asked for; the real, already-working gate is the live-intent check
in §6.1/§9 (Something Real + Rishta Ready only). Expanding to Just Vibing
later, if that's ever wanted, is a one-line change to
`VOUCH_INTENTS` in `lib/vybeVouch.ts`.

Original phased plan, for reference (superseded by the above):
- ~~Phase 1 — ship behind a `FeatureFlag` defaulted off, exercised with
  PKR's own test accounts.~~
- ~~Phase 2 — turn on for Something Real + Rishta Ready at a low
  `rolloutPercent`.~~
- ~~Phase 3 — expand to Just Vibing once invites are getting answered.~~

## 8. Web + native

No native-specific work needed. findmyVybe ships as a Capacitor shell
loading the live Vercel deployment (`capacitor.config.ts`) — every route and
page above is just more pages on that same web app, automatically available
on iOS/Android the moment they're live on web, same as every other feature
to date. The one native-adjacent touchpoint, sharing the invite link, uses
the standard Web Share API, which Capacitor's WebView already supports
without any plugin — no new dependency, no App Store/Play Store review
surface to worry about.

## 9. What happens to a match when someone's intent changes

Raised by PKR alongside the decisions in §6, and genuinely relevant to Vybe
Vouch's intent-gating (§6.1) rather than a tangent: once intent determines
which matches are even eligible for this feature, "what if intent changes
after the match already exists" stops being optional to think through.

**The short version: nothing breaks, and most of this already works today
with zero new code — there's one real gap worth closing.**

**An existing match is never dissolved, hidden, or unmatched by an intent
change.** `Match` has no `intent` column at all (confirmed in
`prisma/schema.prisma`) — intent lives only on `Profile`, read fresh at
request time. Someone editing their intent is exactly as disruptive to an
existing match as editing their bio: the match row itself is completely
untouched. This should stay true — a match two people already invested time
in should never evaporate because of a profile edit.

**The post-match "why you two click" layer already recomputes live, including
for a changed intent, with no new work needed.** `app/api/matches/[matchId]/vibe/route.ts`
calls `db.profile.findUnique` fresh on every request for both participants —
nothing about a match's signals or copy is snapshotted at match time. And
`lib/matchSignals.ts`'s `resolvePairIntent()` already has an explicit rule
for two different intents on one match: default to the MORE serious of the
two (`JUST_VIBING < SOMETHING_REAL < RISHTA_READY`), specifically so — per
that function's own comment — "nobody who set Marriage intent gets flirty
casual-intent copy." That rule was written for same-session mismatches
(discovery mostly pairs same-intent people, but not always), but it applies
identically to a mismatch created by one side changing intent after the
fact. So: two people match while both are Just Vibing; six weeks later one
of them changes to Something Real; the next time either opens the Shared
Vybe tab, `pairIntent` resolves to `SOMETHING_REAL` and the copy/tone
shifts accordingly — automatically, already-working behavior, not something
this feature needs to build.

**The one real gap: intent-specific onboarding fields don't backfill.**
`RelationshipStyle` answers only exist for people who onboarded (or
re-onboarded) as Something Real; the future-vibe fields (`futureHome`,
`futureFamily`, `futureCareer`, `futureMoney`, `children`, `valuesTags`)
only exist for Rishta Ready; `dateVibeTags`/`tonightTags` only exist for
Just Vibing (all per `lib/matchSignals.ts`'s tier comments). Someone who
jumps Just Vibing → Rishta Ready keeps every signal they already had
(shared interests/tribes/Vybe-prompt answers are intent-agnostic), but
contributes nothing to Tier 5 until they actually answer the Rishta Ready
-specific questions — so an existing match's signal set would quietly get
thinner on their side rather than richer, which is the wrong direction for
someone who just signaled they're getting more serious.

**Recommendation:** when a user changes `Profile.intent`, immediately
prompt them (once, right then — not a forced full re-onboarding) to answer
the new intent's incremental extra questions only. This is additive to
onboarding, not a new system: the same question set that intent already
asks new signups, just triggered by an intent change on an existing
profile instead of only at signup. Keeps existing matches' "why you click"
signals getting richer on an upgrade (Just Vibing → Something Real →
Rishta Ready) instead of silently going sparse, and costs no new
infrastructure — it's the existing onboarding questions, re-entered through
a different trigger.

**No special notification when a match partner's intent changes.** Explicit
"they changed their mind" announcements turn an ordinary profile edit into
a broadcast event, and this app has no push notifications yet anyway (see
§5's note on `Match.mutedAAt`). The live-recompute already surfaces the
change gracefully and in-context — present when someone actually opens the
Shared Vybe tab, not pushed at them — which is the right amount of
visibility here, consistent with how the rest of this feature (and this
app generally) handles state changes.

**Vybe Vouch itself: gate by current live intent, not intent-at-match-time.**
Since nothing about intent is snapshotted anywhere else in this codebase,
Vybe Vouch shouldn't be the first thing to start snapshotting it. §3a's
eligibility check (is this match's `resolvePairIntent()` result Something
Real or Rishta Ready — see §6.1) should run against each participant's
*current* `Profile.intent` at the moment someone taps "Get a Vybe Vouch,"
not a value captured when the match was created. Consequence, and it's the
right one: a match formed while both people were Just Vibing automatically
becomes Vybe-Vouch-eligible the moment either side's current intent crosses
into Something Real or Rishta Ready — no backfill, no special-casing, no
"this match predates the feature" edge case to handle. The existing
live-everything architecture just does the right thing here for free.

**Not addressed here, flagged for later only if it becomes a real problem:**
rate-limiting how often someone can change intent at all. No cooldown is
proposed — most people will change it rarely and sincerely (casual →
serious is a real life update), and a cooldown is a solution to a gaming
problem (e.g., bouncing intent to keep re-entering fresh discovery pools,
or to toggle Vybe-Vouch eligibility) that hasn't been observed yet. Worth
revisiting only if abuse actually shows up, the same "don't pre-build for a
problem you don't have evidence of" instinct already applied to Vybe
Vouch's own invite rate-limit in §3a.
