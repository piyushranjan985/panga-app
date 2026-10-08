# Data Retention, Archiving & Volume Limits — Design Spec

Status: **Built, purge jobs OFF by default pending product/legal sign-off — 2026-10-08**
Owner: Platform
Related: `lib/swipeRateLimit.ts`, `app/api/swipe/route.ts`,
`admin/lib/retentionEnforcement.ts`, `admin/app/api/cron/retention-purge/route.ts`,
`admin/scripts/seed-admin.ts`, `admin/docs/DPDP_COMPLIANCE.md` §7,
`app/api/profile/photos/route.ts`, `app/profile/page.tsx`

NOT LEGAL ADVICE. Every retention figure below is a product/engineering
starting point grounded in public competitor policy and the DPDP Act/
Rules as researched 2026-10-08 -- confirm the exact numbers with counsel
before relying on them, same disclaimer as `admin/lib/retentionEnforcement.ts`.

## 1. The problem: two tables grow forever, with no retention policy enforced

`Swipe` and `Message` are both append-only in practice (nothing ever
purges them) and both grow with usage, not with time -- the more
successful findmyVybe is, the faster they grow. At the scale this app is
built for (millions of users per city), this is a real, compounding
Neon storage cost (`$0.35/GB-month`, forever) and, more subtly, a slow
drag on query/index performance even with the good indexes already in
place. `Swipe` is the bigger risk of the two: swiping is a much higher-
frequency action than chatting (people burn through dozens of profiles
a sitting), and `Swipe` rows are deduped per pair but never deleted, so
the table's size tracks "every distinct person anyone has ever evaluated,"
not "people actively using the app today."

A `RetentionPolicy` table and a Retention Policies admin page already
existed before this work (see `admin/docs/DPDP_COMPLIANCE.md` §7) --
including a row already seeded for `'Expired/unmatched swipes'`
(180 days) -- but no purge job read it. This work builds that job for
both Swipe and a new Message category, wires it into the existing daily
`admin/app/api/cron/retention-purge` cron, and leaves both switched OFF
(`autoDeleteEnabled: false`) until a human turns them on from the
Retention Policies page -- the same "fully built, deliberately not
defaulted on" pattern this codebase already uses for the account-
deletion purge.

## 2. Why Swipe rows can't just be deleted outright

`Swipe` isn't only a log -- `app/api/discover/route.ts` queries it
directly to exclude anyone already swiped on from ever reappearing in
Discover, and `lib/searchBehaviorBoost.ts` reads a user's last 200 VYBE
swipes for ranking. Deleting a row doesn't just save space, it makes
that profile swipeable again. The purge therefore only ever removes:

- a **PASS** swipe, regardless of age, once past the retention window, or
- a **VYBE** swipe that never became a Match (unreciprocated), once past
  the window.

A VYBE swipe that DID lead to a Match is never touched, at any age --
that swipe is the origin of a real (possibly still-active) relationship,
not "expired." This is a deliberate, disclosed product-behavior change
once turned on: a profile you passed on, or liked without it being
reciprocated, more than `retentionDays` ago becomes visible/swipeable
again, since nothing else records "already seen." That's intentional,
not a bug -- profiles change over months, and several competitors do
something similar (resurfacing older passes) -- but it's exactly the
kind of thing that should be a deliberate "yes, turn it on" decision, not
a side effect nobody signed off on.

## 3. Swipe volume limit (not a paywall)

Also added: `lib/swipeRateLimit.ts`, a 50-per-rolling-24h cap per user on
new swipes, enforced in `app/api/swipe/route.ts` before the
`Swipe.upsert()`, returning 429 once hit. Configurable via
`SWIPE_DAILY_LIMIT` (`.env.example`).

This exists for cost/abuse containment, not monetization -- findmyVybe
has no swipe paywall, unlike the competitors below, so 50 is set
deliberately generous (above Bumble's free cap, in Tinder's historical
range) so a genuine user should essentially never hit it:

| App | Free daily swipe/like limit | Reset |
|---|---|---|
| Hinge | 8 outgoing likes/day | Fixed 4:00am local time |
| Bumble | 25 right-swipes/day | Rolling 24h from last use |
| Tinder | No longer a flat number -- historically ~100/12h, now personalized per user (roughly ~50-100/day by most estimates) | Rolling |
| **findmyVybe** | **50/day (this change)** | **Rolling 24h** |

Hinge's and Bumble's low numbers are deliberate monetization gates (pay
for "Unlimited Likes"/Bumble's paid tiers to go past them) -- that's a
different goal from this cap, which exists purely so the `Swipe` table's
daily per-user growth and worst-case scraping/bot load both have a
ceiling. If findmyVybe ever wants a monetized "unlimited swipes" tier
later, lowering the free default (e.g. to 25-30, matching Bumble) would
set that up -- not needed today.

## 4. Message retention

Unlike Swipe, a Message's value is almost entirely about an ongoing
relationship the user is actively engaged in -- nobody expects their chat
history with someone they're still matched with to disappear. So this
policy is scoped to conversations that have actually ENDED
(`Match.unmatchedAt` set), measured from the unmatch date, not from each
message's own `createdAt` -- an active match's history, however old, is
never touched, at any age, under any circumstance.

Once unmatched, `Message` rows for that match are purged after a grace
period -- default 90 days -- that exists specifically to leave a window
for a report or safety investigation to still have the content
available. 90 days is not arbitrary: it matches what Tinder and Hinge
both publish as their own post-closure safety-retention window (see §5),
and lines up with DPDP Rules 2025's own 90-day response deadline for a
data-principal's request (Rule 14(3)) -- using the same number as the
window within which a dispute would realistically need to be raised
anyway. The `Match` row itself is kept (useful for aggregate "N past
matches" history/safety lookups without retaining conversation content);
only `Message` (and cascading `MessageLike`) rows are deleted.

**Known gap, left open deliberately:** most matches probably never get
explicitly unmatched -- they just go quiet. This policy does nothing for
those (by design: nobody asked for a live, unused match's history to be
deleted, and doing that uninvited is a worse outcome than the storage
cost). If dormant-conversation storage becomes a real cost line later, a
separate, more conservative policy (e.g. "no messages from either side
in N years AND neither side has opened it recently" -> export to cold
storage rather than delete) is the natural follow-up -- not built here.

## 5. Competitor retention research (account-level, informs the grace-period numbers above)

| App | Retention after voluntary account closure | After a ban |
|---|---|---|
| Tinder | 3 months ("safety retention window... to investigate unlawful or harmful conduct") | 1 year |
| Hinge | 3 months (same stated purpose) | Up to 2 years |
| Bumble | 28 days to reactivate; up to 30 days to fulfil an explicit erasure request; some data kept for enforcing blocks or legal/regulatory reasons (no specific day count published) | Not specified |

India-specific grounding: the DPDP Act 2023 itself sets no fixed maximum
retention period -- its principle is storage limitation ("no longer than
necessary for the purpose"), with erasure or irreversible anonymisation
required once the purpose ends or consent is withdrawn, unless another
law requires longer retention. The DPDP Rules 2025 (notified 13 Nov
2025; core obligations phase in by 13 May 2027) add a few concrete
numbers relevant here: Rule 8(3) sets a one-year MINIMUM retention floor
for certain traffic/processing logs tied to specific listed (mostly
government/Significant-Data-Fiduciary-assessment) purposes -- not
directly about Swipe/Message, but the same "minimums exist, maximums are
policy-set-and-disclosed" shape this doc follows -- and Rule 14(3) gives
a data fiduciary up to 90 days to respond to a data-principal request.
The existing `'Deleted-account data (pre-anonymization hold)'` policy
(180 days, already `autoDeleteEnabled: true`) cites IT Rules 2021 Rule
3(1)(h) for that figure; this doc doesn't revisit that one.

## 6. Profile photo limit: kept at 5

Checked against the same three competitors:

| App | Max photos |
|---|---|
| Tinder | 9 |
| Bumble | 6 (photos/videos combined) |
| Hinge | 6 (plus 3 required prompts, a separate element) |
| **findmyVybe** | **5 (kept as-is)** |

5 is slightly below the Bumble/Hinge norm of 6 and well below Tinder's
9. An earlier pass on this file bumped `MAX_PHOTOS` to 6 to match
Bumble/Hinge; that change was reverted at PKR's explicit instruction --
`MAX_PHOTOS` stays 5 in both `app/api/profile/photos/route.ts`
(enforcement) and `app/profile/page.tsx` (the "+ Add" tile's
visibility). Noted here for the record, not as an open question.

## 7. How to turn the purge jobs on

Nothing above runs automatically. From the admin portal's Retention
Policies page, flip `autoDeleteEnabled` for `'Expired/unmatched swipes'`
and/or `'Ended-match conversation messages'` once satisfied with the
retention windows and the resurfacing-after-expiry behavior in §2. The
existing daily cron (`admin/vercel.json`, `0 3 * * *`,
`/api/cron/retention-purge`) picks up the change on its next run with no
deploy needed -- both new purge blocks respect `LegalHold` the same way
the existing deletion-purge does, and each writes one aggregate
`AuditLogEntry` per run (not one per row) when anything was actually
purged.
