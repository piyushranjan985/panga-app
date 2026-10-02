# Vybe Vouch — Design Spec

Status: **Design — pending product-owner sign-off before implementation**
Owner: Product / Platform
Related: `lib/vibeMatch.ts`, `lib/matchAuthz.ts`, `app/api/preview/[userId]/route.ts`
(Family Preview — the closest existing feature, see §0), `prisma/schema.prisma`
(`FeatureFlag`, `Match`, `Profile.familyPreviewOn`)

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
  reaction  String          // 'GOOD_VYBE' | 'ASK_MORE' | 'FLAGGED'
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
    "intent": "SOMETHING_REAL",
    "vibeSummary": {
      "percent": 0,
      "sharedLine": "...",
      "highlights": ["..."]
    }
  }
}
```

`vibeSummary` is built by calling the existing `lib/vibeMatch.ts` narrative
generator with both profiles' data — reuse, not reimplementation. Everything
else mirrors the fields `app/api/preview/[userId]/route.ts` already exposes,
plus the `vibeSummary` which Family Preview deliberately omits (that route's
own comment says "no Vybe Check prompt answers" for the public always-on
link — correctly more conservative, since that link is unscoped/indefinite;
a Vybe Vouch invite is one-shot, short-lived, and explicitly sent to one
named trusted person by the inviter themselves, which is a different risk
profile).

**Deliberately excluded**, same reasoning as Family Preview: bio free text,
full photo grid (one photo only), chat history, contact info, exact match
date.

### 3c. `POST /api/vouch/[token]` — submit a reaction

Unauthenticated. Body: `{ reaction: 'GOOD_VYBE' | 'ASK_MORE' | 'FLAGGED', note?: string }`
(`note` length-capped, e.g. 200 chars). Fails with the same generic
"unavailable" response if the invite is missing/expired/revoked/already
consumed. On success: creates `VybeVouchResponse`, sets `consumedAt`, returns
a simple "thanks" confirmation. A second `GET` after this point serves a
static "you've already answered this" page instead of the form.

## 4. Pages

- `app/vouch/[token]/page.tsx` — new, unauthenticated, outside-the-app page
  shell, directly mirroring `app/preview/[userId]/page.tsx`'s existing
  pattern (same "no login, works for anyone with the link" shape). Shows the
  safe summary, the three reaction buttons, optional note field, submit.
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

## 6. Open questions for PKR (need an answer before implementation starts)

1. **Which intents get this first?** Recommendation: Rishta Ready only at
   launch (cultural fit is strongest there, user base is smallest while
   rough edges get found), expanding to Something Real and then Just Vibing
   once usage looks healthy. Uses the existing `FeatureFlag` model
   (`rolloutPercent` + a flag per intent, or one flag gated by a server-side
   intent check) — no new flagging infrastructure needed.
2. **Invite expiry window** — proposing 7 days. Long enough that someone can
   realistically get their friend/parent to look at it, short enough that a
   stale, forgotten link isn't sitting around indefinitely.
3. **Per-match invite cap** — proposing max 3 *pending* invites at once per
   person per match, to bound the rate-limit design in §3a without being so
   strict it blocks the obvious legitimate case (one to a best friend, maybe
   a separate one to a parent).
4. **Exact reaction set/copy** — proposing 👍 Good vibe / 🤔 Ask more / 🚩
   Something feels off, but the copy and whether a fourth "no strong
   opinion" option is worth adding is a product-feel call, not an
   engineering one.
5. **Does a 🚩 FLAGGED response do anything beyond showing the inviter a
   private note?** Current design: no — purely advisory, per §1's
   guardrails. Worth explicitly confirming this stays true even under
   pressure to "do more with it" later, since that's the exact slope that
   would turn this into the shaadi-site dynamic the product avoids.

## 7. Rollout (phased, same approach as identity verification)

- **Phase 1** — schema migration + both API routes + the unauthenticated
  page, shipped behind a `FeatureFlag` defaulted off. Exercised end-to-end
  with PKR's own test accounts before anyone else sees it.
- **Phase 2** — chat-screen entry point + response card, turned on for one
  intent (recommendation: Rishta Ready, see §6.1) at a low `rolloutPercent`.
- **Phase 3** — expand to the remaining intents once invites are actually
  getting answered and nothing's come through the existing `Report` model
  that traces back to this feature.

## 8. Web + native

No native-specific work needed. findmyVybe ships as a Capacitor shell
loading the live Vercel deployment (`capacitor.config.ts`) — every route and
page above is just more pages on that same web app, automatically available
on iOS/Android the moment they're live on web, same as every other feature
to date. The one native-adjacent touchpoint, sharing the invite link, uses
the standard Web Share API, which Capacitor's WebView already supports
without any plugin — no new dependency, no App Store/Play Store review
surface to worry about.
