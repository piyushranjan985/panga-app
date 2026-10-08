# Moderation Service — Phase 1 Microservice Extraction

Status: **Built, not yet cut over** (`IMAGE_MODERATION_PROVIDER` still defaults
to `self-hosted` in every deployed environment until someone deliberately
flips it to `remote` — see §4)
Related: `IDENTITY_VERIFICATION_AND_SAFETY.md` (§1, §3), `../moderation-service/README.md`

## 0. Why this exists

findmyVybe is currently one modular monolith (plus the separate `admin/`
app, sharing one Postgres database). That's the right architecture for
where the product is today — see the "is this modular, is it
microservices" conversation this doc grew out of. If/when a real reason
to split further ever shows up (independent scaling, independent
deploy cadence), the right approach is incremental extraction of one
bounded piece at a time, not a rewrite — and this is that first piece,
done as a low-risk proof of the pattern before ever touching the parts
that are genuinely hard (shared Postgres schema, cross-service
transactions). Image moderation was picked first because it was already
the most self-contained, most CPU-heavy, least data-owning piece in the
codebase — see §1.

## 1. What actually moved, and what deliberately didn't

`lib/safety/imageModeration.ts`'s `ImageModerationProvider` interface
already treated "how is this image actually analyzed" as swappable
(the file's own top comment: "Swapping providers ... means writing one
new class here — nothing else in the app changes"). That made this
extraction almost free: a new provider implementation, not a rewrite of
anything that calls it.

**Moved** to `moderation-service/` (its own folder, its own
`package.json`, meant to be its own Vercel project):
- The actual nsfwjs (nudity classification) + `@vladmandic/face-api`
  (face counting) inference — `lib/imageAnalysis.ts` there is a direct
  port of what used to be `selfHostedImageModerationProvider`'s body in
  the main app.
- The image decode pipeline (sharp + heic-convert, the hard-won
  JPEG/PNG/WebP/HEIC handling — see that file's own DECODE HISTORY
  comment, carried over verbatim).
- The face-api model weight files and the script that stages them
  (`scripts/download-face-api-models.mjs`, a straight port).

**Did NOT move, and shouldn't, even in a later phase:**
- The policy decision (`lib/safety/policyEngine.ts`'s
  APPROVED/REJECTED/MANUAL_REVIEW logic). This is product/business
  logic, not ML inference — it doesn't need TensorFlow.js, and keeping
  it in the main app means there's exactly one place that decision ever
  changes.
- Every database write (`lib/safety/moderateAndUpload.ts`'s
  `recordPhotoModeration` — the `Photo`, `PhotoModerationResult`, and
  `ModerationCase` rows). The moderation service has no database
  connection at all, no Prisma, no `DATABASE_URL`. It receives bytes,
  returns `{ faceCount, nudityScores }`, and knows nothing about who
  the photo belongs to.

This is deliberate and matters for anyone extracting the *next* piece
(notifications, then matching, per the original plan): extract the
stateless, computationally expensive part first, and leave data
ownership exactly where it is for as long as possible. The hard version
of microservice extraction — splitting the shared Postgres schema along
service boundaries — is a separate, much bigger decision this phase
does not make.

## 2. The contract

`POST /api/analyze` on the moderation service. See
`moderation-service/README.md` for exact curl examples.

- **Auth**: `Authorization: Bearer <MODERATION_SERVICE_SECRET>` — same
  bearer-secret pattern the existing `CRON_SECRET`-protected cron routes
  already use (`app/api/cron/*/route.ts`), not a new pattern.
- **Request body**: raw image bytes, `Content-Type:
  application/octet-stream`. No multipart, no base64 — binary
  passthrough, so the request stays under Vercel's 4.5MB function body
  limit exactly as it already did when this same buffer arrived at the
  main app's own upload route (nothing here is a smaller or bigger
  envelope than before).
- **Responses**:
  - `200 { faceCount, nudityScores: { porn, hentai, sexy } }` — exactly
    the `ModerationSignals` shape `policyEngine.ts` already expects.
  - `401 { error: 'unauthorized' }` — bad/missing secret.
  - `422 { error: 'undecodable_image', message }` — corrupt file or a
    format neither sharp nor heic-convert understands. The main app's
    `remoteImageModerationProvider` turns this back into an
    `UndecodableImageError`, so `moderateAndUpload.ts` keeps treating it
    exactly like it already does for the self-hosted provider: a hard
    REJECTED with no human-reviewable `ModerationCase` opened, because
    there's nothing for a reviewer to look at.
  - `500 { error, message }` — the service's own infra problem (model
    files missing, a crash). The client wraps this (and any network
    failure reaching the service at all) in a plain `Error`, which
    `moderateAndUpload.ts` already treats as "our infra is broken" —
    REJECTED, logged loudly, never silently downgraded to
    MANUAL_REVIEW (see that file's comment on the 2026-09-26 product
    decision for why).

Both sides of this contract were tested together end-to-end (a real
local HTTP round trip, not just unit-level) before this was committed:
the happy path, an unauthenticated request, an empty body, and a
corrupt-image request all returned exactly the status/shape above.

## 3. In the main app

`lib/safety/imageModeration.ts` gained one more
`ImageModerationProvider`: `remoteImageModerationProvider`. Nothing else
changed — `moderateAndUpload.ts`, `policyEngine.ts`, every upload route,
all untouched, because they only ever talk to the
`ImageModerationProvider` interface, never to a specific provider.

`getImageModerationProvider()` now has three branches:

| `IMAGE_MODERATION_PROVIDER` | What runs |
|---|---|
| unset / anything else | `mock` — never looks at the image (dev/tests only; see `isUnsafeProductionMock`'s production safety guard) |
| `self-hosted` | nsfwjs + face-api **in-process**, in the main app (today's default everywhere) |
| `remote` | HTTP call to this new service |

## 4. Deploying and cutting over (manual steps — not done yet)

1. Create a new Vercel project from this same repo, **Root Directory**
   set to `moderation-service` (identical to how `admin/` is already a
   separate project from the same repo).
2. Set `MODERATION_SERVICE_SECRET` on that project (Production +
   Preview) — any long random string.
3. Deploy it. Note its URL.
4. On the main `findmyvybe-app` Vercel project, set
   `IMAGE_MODERATION_SERVICE_URL` (that URL) and
   `IMAGE_MODERATION_SERVICE_SECRET` (the same string from step 2),
   Production + Preview.
5. Test it directly first (see `moderation-service/README.md`'s curl
   example) before touching the main app's provider setting at all.
6. Only once that's confirmed working, flip
   `IMAGE_MODERATION_PROVIDER=remote` on the main app and redeploy.
   `self-hosted` keeps working the entire time as an instant rollback —
   nothing is removed from the main app yet.
7. Once `remote` has run in production for a while and is trusted, a
   later cleanup step can remove `nsfwjs`, `@vladmandic/face-api`,
   `@tensorflow/tfjs*`, and `heic-convert` from the main app's
   `package.json` (sharp stays — Next.js's own image optimization uses
   it) and drop `selfHostedImageModerationProvider`. Not done as part of
   this phase, on purpose — keep the rollback available until this has
   proven itself with real traffic.

## 5. Cost

$0 to stand up: a second Vercel Hobby-tier project (same free function
limits — 2GB memory, 300s max duration — the self-hosted path already
runs within today), no new database, no new paid API. One thing worth
knowing that's true regardless of this specific change: Vercel's Hobby
plan terms restrict it to personal/non-commercial use, which is a
question about findmyVybe's hosting generally (it predates this
extraction and isn't made any truer or falser by adding a second free
project) — worth a decision at some point, not a blocker here.

## 6. What's next, if this phase proves out

Per the original incremental plan: notifications next, then matching.
Both are different in kind from this one, worth knowing going in:
- **Notifications** (`lib/notifications/`, FCM push sending) is
  stateless in the same way image moderation is — a reasonable next
  target with the same shape of extraction.
- **Matching** (`lib/matching.ts`) is pure/DB-free already, but
  "extracting" it doesn't mean much on its own since the expensive part
  (querying candidates) lives in `lib/discoverPool.ts`, which reads the
  shared Postgres database directly. Splitting that is the first time
  this project would hit the actually hard problem flagged in the
  original scaling conversation: shared data, not shared compute. That
  deserves its own design pass when it comes up, not a repeat of this
  phase's pattern.
