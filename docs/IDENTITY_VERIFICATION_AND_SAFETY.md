# Identity Verification & Content Safety — Architecture

Status: **Design — approved for phased build**
Owner: Trust & Safety / Platform
Related: `admin/docs/DPDP_COMPLIANCE.md`, `MOBILE_APP_SETUP.md`

This document designs the mandatory identity-verification and photo-safety
system requested for findmyVybe, built as an extension of the Trust & Safety
infrastructure that already exists in this codebase (`ModerationCase`,
`Report`, `AdminUser`/RBAC, `AuditLogEntry`, `RetentionPolicy`) rather than a
parallel system. Anywhere this doc says "already exists," see the file
referenced — the goal is one moderation queue, one audit trail, one set of
admin permissions, not a second one bolted on for photos/identity.

Provider choices locked in for this design (confirmed with product owner):

| Concern | Provider | Why |
|---|---|---|
| Government ID verification | **DigiLocker** (Government of India) | Free, no UIDAI AUA/KUA licensing needed — user consents via OTP and shares a document DigiLocker already holds; we never receive or store a raw Aadhaar/PAN number. |
| Face match (selfie vs ID photo) | **Descoped by product decision (2026-09-26) — not built.** See §2, §3 for the consequence. |
| Nudity / explicit-content detection | **Self-hosted, open-source** (nsfwjs) | $0 cost requirement. |
| Face detection / face count | **Self-hosted, open-source** (@vladmandic/face-api) | $0 cost requirement. Presence/count only — no embeddings, since there's no face-match to support. |
| AI-generated / deepfake detection | **No reliable free option exists.** Routed to manual review instead of automated rejection (see §3, §13). Documented as a known gap with a paid-vendor upgrade path (Sightengine/Hive), not silently skipped. |

---

## 1. Architecture

New module: `lib/safety/` — a single place all moderation/verification logic
lives, matching the request's "dedicated moderation service/module, not
scattered logic":

```
lib/safety/
  identityVerification.ts   # provider-agnostic interface + DigiLocker + mock
  imageModeration.ts        # provider-agnostic interface + self-hosted models + mock
  policyEngine.ts           # combines moderation signals -> APPROVED/REJECTED/MANUAL_REVIEW
  quarantineStorage.ts      # upload-to-private-path -> moderate -> promote-or-delete
  guards.ts                 # requireVerifiedAndActive() etc. — used by every gated API route
  duplicateIdentity.ts      # HMAC document-hash check
```

Upload flow (every image, every path — onboarding, profile photos, any
future chat/story attachment):

```
client uploads file
  -> POST /api/upload or /api/profile/photos  (auth required, unchanged)
  -> assertValidImage()                        (existing type/size check)
  -> quarantineStorage.put()                    (Vercel Blob, "pending/" prefix,
                                                  NOT linked into any Photo row yet)
  -> policyEngine.evaluate(buffer)
       - imageModeration.detectFace()
       - imageModeration.detectNudity()
  -> decision:
       APPROVED       -> quarantineStorage.promote() -> Photo row created,
                          moderationStatus=APPROVED
       MANUAL_REVIEW   -> Photo row created, moderationStatus=MANUAL_REVIEW
                          (NOT shown to other users — see §4/§6),
                          ModerationCase(sourceType=AUTOMATED_FLAG) opened
       REJECTED        -> blob deleted immediately, no Photo row, no public
                          URL ever existed
  -> response to client includes moderationStatus so the UI can show
     "under review" / "not allowed" instead of assuming success
```

Enforcement flow (every gated action — discover, swipe, match, message):

```
API route handler
  -> getSession()                    (existing)
  -> checkAccountActive(userId)      (lib/accountEnforcement.ts — extended, see §7)
     - checks Profile.verification === 'VERIFIED'
     - checks User.status !== BANNED/SUSPENDED/DELETED (existing enum, reused not duplicated)
     - checkMessagingAllowed() additionally checks User.messagingRestricted for messaging routes
  -> existing route logic, unchanged
```

Native (iOS/Android): findmyVybe ships as a Capacitor **remote-URL** app
(`capacitor.config.ts` — the native shells load the live web app, they are
not a separate codebase). This means none of this feature is
"native-specific" — the enforcement above covers web, iOS and Android
identically because it's the same server, and there's no camera capture
step at all now that selfie-vs-ID face matching is descoped (identity
verification is a DigiLocker document consent flow only). An old app
version pointed at an old deployment is still hitting the *current*
backend (remote-URL apps always load the latest deployment), so there is
no "old client" enforcement gap to design around — §10's "old mobile
client" test is really testing "a client that sends a crafted request,"
not a stale build.

## 2. Identity-verification provider integration (DigiLocker)

> **Scope decision (2026-09-26):** selfie-vs-ID-document face matching is
> explicitly descoped by product decision. There is no selfie capture, no
> liveness check, and no face-match step anywhere in this flow. DigiLocker
> verification confirms: the person holds a government-issued document;
> that document's own DOB puts them at 18 or older (checked against the
> document, never the self-reported profile DOB — see below); that DOB is
> consistent with what they told us at onboarding; and the document's
> name shares at least one word with their profile display name. It does
> **not** confirm that the person using the account is the person named
> on the document — that would need a selfie + face-match step, which is
> a real, intentional reduction in assurance from the original design
> (which is why this note exists instead of quietly editing history) —
> see §3 for the matching consequence on the photo-moderation side.

DigiLocker is a Government of India OAuth2-based document-sharing API. The
user authorizes a document pull via an OTP-based consent screen on
DigiLocker's own site — findmyVybe never sees their DigiLocker password, and
critically, DigiLocker returns the *document*, not raw credentials we'd have
to protect ourselves.

Flow (implemented in `lib/safety/identityVerification.ts` +
`app/api/verification/{route,callback/route,status/route}.ts`):

1. `POST /api/verification` — creates a DigiLocker OAuth authorization URL
   (`response_type=code`, our `client_id`, a signed+expiring `state` token
   binding this flow to the logged-in `session.userId`), sets
   `Profile.verification = PENDING`, returns the URL for the client to
   redirect to. In `VERIFICATION_PROVIDER=mock` (the default until real
   credentials exist — see below), this instead simulates the whole round
   trip locally with no redirect, so the state machine is fully testable
   today.
2. User completes consent on DigiLocker, selects **Aadhaar or Driving
   Licence** (not PAN alone — see the provider table above; the UI should
   only offer these two, with copy explaining why PAN isn't sufficient on
   its own if a user asks).
3. `GET /api/verification/callback?code=...&state=...` — verify `state`,
   exchange `code` for an access token, fetch the issued document (document
   type + name + DOB + a document reference).
4. Extract, **in memory only, never written to disk**:
   - document type (`AADHAAR` | `DRIVING_LICENCE`)
   - a document reference, hashed immediately (see below) — the raw value
     is never persisted
   - DOB — checked directly for a minimum age of 18 (see below), and
     separately cross-checked against `Profile.dateOfBirth` (a mismatch
     there alone, once already known-adult, is `MANUAL_REVIEW` not a
     reject — people genuinely mistype onboarding DOB)
   - name — compared against `Profile.displayName` (see below)
5. `duplicateIdentity.checkDuplicateIdentity(...)` — see below.
6. `identityVerification.decideVerificationOutcome(...)` applies, in
   order: duplicate document → `REJECTED`; document DOB says under 18 →
   `REJECTED` (a hard stop, no human-override path, unlike every other
   check here); document DOB unparseable → `MANUAL_REVIEW`; DOB doesn't
   match the profile's → `MANUAL_REVIEW`; document name shares no word
   with the profile's display name → `MANUAL_REVIEW`; otherwise
   `VERIFIED`. Only the **result** is persisted (see §8) — the raw
   document payload is discarded when the request completes, by never
   assigning it to
   anything beyond a local variable in the handler.

**Real credentials, honestly**: DigiLocker's API has no license fee, but
production OAuth credentials (`DIGILOCKER_CLIENT_ID`/`DIGILOCKER_CLIENT_SECRET`)
require findmyVybe's own organization to register and pass a KYC/Terms-of-
Service approval process on the API Setu Partners portal (apisetu.gov.in) —
a manual, calendar-time process, not something achievable from this
codebase. Until that's complete, `VERIFICATION_PROVIDER` stays `mock`
(the default) and the app is fully testable end-to-end; flipping to
`digilocker` once credentials exist requires no other code changes. The
exact document-pull endpoint path/response shape is assigned per-partner
in the approval packet — `fetchDigilockerIdentityDocument()` is written
against the general shape of that API and is the one place likely to need
a small adjustment once real credentials are in hand.

**Duplicate-identity prevention** (from §1 requirements: "one verified
identity cannot be used to create unlimited accounts"): compute
`HMAC-SHA256(documentReference, DUPLICATE_CHECK_PEPPER)` where the pepper is
a server-only secret (env var, never logged). Store only this hash in a
`@unique` column (`IdentityVerification.documentHash`). A second account
attempting to verify with a document that hashes to the same value is
`REJECTED` with `failureReason: "duplicate_identity"` and opens a `HIGH`
severity `ModerationCase` (category `scam_fraud`) rather than being sent to
routine manual review — a shared government ID number behind two accounts
is a specific, strong fraud signal, not an ambiguous case. We never store or
can reverse-engineer the real document number from the hash.

## 3. Image-moderation provider/model (self-hosted, $0)

Two self-hosted, open-source models run in-process inside the Next.js API
route (Node runtime, not Edge):

- **nsfwjs** (MIT license, TensorFlow.js) — classifies an image across
  `Drawing / Hentai / Neutral / Porn / Sexy` categories with confidence
  scores. `policyEngine` treats `Porn + Hentai` above threshold as an
  automatic `REJECTED`, `Sexy` above a lower threshold as `MANUAL_REVIEW`
  (this catches "content designed to circumvent moderation" — borderline
  cases go to a human instead of a coin-flip auto-decision).
- **@vladmandic/face-api** (MIT license, TensorFlow.js) — returns face
  count only (no embeddings — see the scope decision below). Policy:
  0 faces → `REJECTED` ("no detectable human face"); exactly 1 face with
  clean nudity scores → `APPROVED`; 2+ faces → `MANUAL_REVIEW` (a group
  photo is allowed per the spec, but with no face-match signal there's no
  automated way to tell which face is the account owner, so a human
  decides).

> **Scope decision (2026-09-26), same as §2:** the original design
> matched each detected face against a verified-selfie embedding captured
> during identity verification. That step is descoped — there is no
> selfie, and therefore no embedding to match against, anywhere in this
> app. `matchedVerifiedFace` was removed from `ModerationSignals` entirely
> rather than left in and permanently `null`, so the policy engine's logic
> reads correctly for what this app actually does now. The direct
> consequence: a clean single-face photo is approved on face-presence and
> nudity alone, with **no check at all** that the face belongs to the
> account's verified identity. Someone could pass ID verification with
> their own document and then upload a different person's photo, and
> nothing here would catch it. That gap is deliberate and known, not
> accidental — revisit §2's flow (adding a selfie + face-match step back
> in) if that assurance is ever needed.

**Deployment note, three-times-revised**: the original plan used
`@tensorflow/tfjs-node`, whose native binary (100MB+) risks exceeding a
Vercel serverless function's size/memory limits. The first replacement —
plain `@tensorflow/tfjs` plus the `canvas` package for image decoding —
was implemented, then broke a real Vercel deploy outright: `canvas`'s
native addon failed to build in Vercel's build image (`Package pixman-1
was not found`, and no prebuilt binary exists for that Node ABI). `canvas`
was removed entirely and replaced with pure-JS `jpeg-js`/`pngjs` decoding
— but that only covered JPEG/PNG, and any other format (WebP, HEIC/HEIF —
i.e. every default iPhone photo) failed to decode and fell through the
fail-safe path into `MANUAL_REVIEW` instead of a hard reject, which made
an unmoderated photo look approved to its own owner. The implementation
now decodes with **`sharp`** (the same native image library Next.js's own
built-in image optimization uses in production on Vercel — its prebuilt
per-platform binaries, e.g. `@img/sharp-linux-x64`, are fully
self-contained npm optional dependencies with no system library headers
required, unlike `canvas`/node-canvas's cairo/pixman dependency) for
JPEG/PNG/WebP/GIF/AVIF/TIFF, with **`heic-convert`** (WASM `libheif-js`,
no native build step) as a pre-conversion pass specifically for
HEIC/HEIF, detected by sniffing the ISOBMFF `ftyp` box rather than a
magic-byte prefix (HEIC shares MP4's container format, so it has no fixed
magic bytes). EXIF orientation is normalized via sharp's `.rotate()` with
no arguments, since phone photos routinely store a rotation flag instead
of pre-rotated pixels. Any buffer that still fails to decode after this —
truly corrupt or unsupported — now throws a distinct `UndecodableImageError`
that `moderateAndUpload.ts` maps to a hard `REJECTED`, never
`MANUAL_REVIEW`, closing the bypass described above. Decoded pixels feed
a `tf.Tensor3D` directly to both nsfwjs and face-api. HEIC photos that
pass moderation are also transcoded to JPEG for storage
(`normalizeImageForStorage` in `lib/upload.ts`), since a raw HEIC file
renders as a broken image in most non-Safari browsers — accepting the
upload format and actually displaying it to other users are two separate
problems, both now handled. Nothing in this path has a native build step
that needs system libraries, so `npm install` can't fail the original
`canvas` way again on any platform or plan.

Known, honestly-documented gap: **there is no reliable free/open-source
AI-generated-person or deepfake detector** comparable to what a paid vendor
(Sightengine, Hive) offers. This gap is *larger* than originally scoped,
precisely because the face-match-against-verified-selfie check that would
have caught most AI-generated faces (a synthetic face won't match a real
verified person) no longer exists. `policyEngine` does not attempt to
auto-reject AI-generated images at all; the only backstop is user
reporting (§7). This is called out explicitly rather than silently
claimed as "done" — see §10's test matrix, which marks this case
`flag/manual-review only, no automated detection`, and see the Definition
of Done note at the end of this document.

Optional, off-by-default secondary signal: Google Cloud Vision's SafeSearch
+ Face Detection has a genuinely perpetual free tier (1,000 units/month per
feature, not a 12-month trial) and can be wired in later as a confidence
booster for borderline cases without changing the provider interface.

## 4. Database schema (Prisma)

Extends the existing schema; nothing below duplicates an existing concept
(verification status stays about identity, not account standing — account
standing is `User.status`, already modeled).

```prisma
enum VerificationStatus {
  UNVERIFIED      // no attempt yet — existing
  PENDING         // DigiLocker flow started, awaiting callback — existing
  MANUAL_REVIEW   // NEW — automated checks inconclusive, human decision needed
  VERIFIED        // existing
  REJECTED        // existing — user may retry, goes back to PENDING
}

model IdentityVerification {
  id                  String   @id @default(cuid())
  userId              String
  user                User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  provider            String   // "digilocker" | "mock"
  documentType         String  // "AADHAAR" | "DRIVING_LICENCE"
  documentHash         String  @unique  // HMAC(documentReference, pepper) — see §2
  providerReference    String  // DigiLocker's own transaction id, for support/audit — not the ID number

  faceMatchScore       Float?  // reserved, always null -- selfie-vs-ID face matching is descoped, see §2/§3
  dobMatchedProfile    Boolean @default(true) // false -> routed to MANUAL_REVIEW

  status               VerificationStatus @default(PENDING)
  failureReason         String?
  reviewedByAdminId    String?
  reviewedAt            DateTime?

  submittedAt          DateTime @default(now())
  decidedAt            DateTime?
  expiresAt             DateTime? // re-verification cadence, e.g. +18 months

  moderationCaseId     String?
  moderationCase       ModerationCase? @relation(fields: [moderationCaseId], references: [id], onDelete: SetNull)

  @@index([userId])
  @@index([status])
}

model PhotoModerationResult {
  id               String   @id @default(cuid())
  photoId          String
  photo            Photo    @relation(fields: [photoId], references: [id], onDelete: Cascade)

  decision         PhotoModerationDecision
  faceDetected     Boolean
  faceCount        Int
  matchedVerifiedFace Boolean?   // reserved, always null -- no verified-selfie embedding exists, see §3
  nudityScore      Float
  provider         String       // "self-hosted-nsfwjs+faceapi" | "mock"
  modelVersion     String       // pin the model version for re-moderation/audit (see §6)

  moderationCaseId String?
  moderationCase   ModerationCase? @relation(fields: [moderationCaseId], references: [id], onDelete: SetNull)

  createdAt        DateTime @default(now())

  @@index([photoId, createdAt])
}

enum PhotoModerationDecision {
  APPROVED
  REJECTED
  MANUAL_REVIEW
}
```

Extend the existing `Photo` model:

```prisma
model Photo {
  // ...existing fields unchanged...
  moderationStatus PhotoModerationDecision @default(MANUAL_REVIEW)
  moderatedAt      DateTime?
  results          PhotoModerationResult[]

  @@index([profileId, moderationStatus])
}
```

Extend `ModerationCase`'s relations (it already supports this shape — only
the inverse relations are new):

```prisma
model ModerationCase {
  // ...existing fields unchanged...
  identityVerifications IdentityVerification[]
  photoModerationResults PhotoModerationResult[]
}
```

`ModerationCase.category` (already a free-text string) gains two new
conventional values, consistent with the existing `photo_violation` /
`sexual_content` already listed in its comment: `"identity_verification"`
and `"duplicate_identity"`.

No new `RetentionPolicy`/`ProcessingActivity` *models* needed — both already
exist for DPDP compliance. Two new **rows** are added (data, not schema —
see `admin/scripts/seed-admin.ts`'s existing seeding pattern):

- `RetentionPolicy`: `dataCategory: "Identity verification raw documents"`,
  `retentionDays: 0`, `autoDeleteEnabled: true`, `legalBasis: "Never
  persisted — processed in-memory only per data-minimization design (see
  docs/IDENTITY_VERIFICATION_AND_SAFETY.md §2, §8)"`.
- `ProcessingActivity`: `name: "Identity verification (DigiLocker)"`,
  `purpose: "Age and identity verification, duplicate-account prevention"`,
  `dataCategories: ["verification result", "document type", "document hash"]`,
  `legalBasis: "Consent"`, `crossBorderTransfer: false`.

## 5. API endpoints

New:

| Method & path | Purpose |
|---|---|
| `POST /api/verification` | Begin DigiLocker consent flow (mock mode resolves the whole thing without leaving this endpoint) — implemented |
| `GET /api/verification/callback` | DigiLocker OAuth callback, runs the real decision — implemented |
| `GET /api/verification/status` | Current user's verification status, for client polling — implemented |
| `POST /api/photos/[photoId]/report` | User-facing "Report Photo" (§7) — not yet implemented |
| `POST /api/profiles/[profileId]/report` | User-facing "Report Profile" (§7) — distinct from existing `Report`'s reason-string shape only by which UI surfaces it; same underlying model — not yet implemented |

Changed (enforcement added, request/response shape mostly unchanged):

| Method & path | Change |
|---|---|
| `POST /api/upload` | Routed through `quarantineStorage` + `policyEngine` before returning a URL; response gains `moderationStatus` |
| `POST /api/profile/photos` | Same; `Photo` row created with real `moderationStatus`, not assumed-approved |
| `POST /api/profile/photos/[photoId]` (replace, if/when added) | Re-moderated exactly like a new upload |
| `GET /api/discover` | `guards.requireVerifiedAndActive()` added |
| Swipe-creation route (`app/api/swipes` or wherever `Swipe` rows are created) | Same guard |
| `GET/POST /api/matches`, `POST /api/matches/[matchId]/messages` | Same guard |

Admin (`admin/app/api/...`, all gated by existing RBAC in
`admin/lib/rbac.ts`):

| Method & path | Permission | Purpose |
|---|---|---|
| `GET /api/moderation/photos` | `content.moderate` | Queue of `MANUAL_REVIEW` photos |
| `POST /api/moderation/photos/[photoId]/decide` | `content.moderate` | Approve/reject override — writes `AuditLogEntry` |
| `GET /api/verification/[userId]` | new `users.viewIdentityVerification` (stricter than `users.viewSensitivePII` — see §9) | Verification detail for one user |
| `POST /api/users/[userId]/actions` | `users.action.resetVerification` (already exists in `rbac.ts`) | Force a user back to `UNVERIFIED` |

## 6. Moderation state machine

`Profile.verification`:

```
UNVERIFIED --(start)--> PENDING --(DigiLocker document pulled)--> {
    document hash matches another account's -> REJECTED  (fraud, final)
    document DOB says under 18              -> REJECTED  (hard safety stop, no retry)
    document DOB unparseable                -> MANUAL_REVIEW
    DOB doesn't match profile's              -> MANUAL_REVIEW
    document name shares no word with
      profile's display name                -> MANUAL_REVIEW
    otherwise                                -> VERIFIED
}
MANUAL_REVIEW --(admin decision)--> VERIFIED | REJECTED
REJECTED --(user retries)--> PENDING   -- EXCEPT a confirmed-underage REJECTED,
                                            which an admin must clear explicitly
                                            (users.action.resetVerification) rather
                                            than the user just resubmitting
```

`Photo.moderationStatus` (per photo, independent of the profile's
verification status):

```
(upload) --(policyEngine.evaluate)--> {
    clean -> APPROVED               (Photo row visible to other users)
    borderline -> MANUAL_REVIEW     (Photo row exists, owner sees "under
                                      review", NOT shown to other users)
    clear violation -> REJECTED     (no Photo row is ever created; blob
                                      deleted; uploader sees rejection reason)
}
MANUAL_REVIEW --(admin decision)--> APPROVED | REJECTED
APPROVED --(re-moderation trigger)--> PENDING re-evaluation, using the same
    three-way outcome above. Triggers: photo reported (§7, immediate),
    model/policy version bump (batch job over all APPROVED photos, §6.1),
    account flagged by an unrelated moderation case (re-check that
    account's photos as part of the case).
```

Re-moderation implementation note (§6.1): `PhotoModerationResult.modelVersion`
lets a batch job find every `APPROVED` photo whose latest result predates
the current model version and re-run `policyEngine.evaluate()` against the
stored (still-quarantined-format) image, without needing a separate
"needs re-review" queue table.

## 7. Security model

"Never trust the client" is enforced by having exactly **one** code path for
each concern, always called server-side, never assumed from a client flag:

- `guards.requireVerifiedAndActive()` — called at the top of every gated
  route (§1). A request that skips the UI entirely (curl, an old/modified
  client, a scripted bot) hits the same check, because the check lives in
  the route handler, not a page-level redirect.
- `lib/safety/policyEngine.ts` — called from the upload route handlers
  themselves, not trusted from any client-supplied "this image is fine"
  field. There is no endpoint that creates a visible `Photo` row without
  going through it — including the onboarding-photos path (`/api/upload`)
  and the profile-photos path (`/api/profile/photos`), which are the *only*
  two image-accepting endpoints in the app today (confirmed by inspecting
  `app/api/`); any future endpoint (chat attachments, stories) must call
  the same `policyEngine.evaluate()` rather than reimplement checks.
- Quarantine storage: an uploaded image never gets a public-facing URL
  until `policyEngine` approves it. Today's `lib/upload.ts` uses
  `@vercel/blob`'s `access: 'public'` for every upload immediately — this
  changes to a two-step `put()` (private "pending/" key, not referenced by
  any `Photo` row) → `promote()` (copy to the public key only on
  `APPROVED`). Vercel Blob URLs are already non-enumerable (random UUID
  keys), but they are not access-controlled while sitting in the "pending"
  prefix, since nothing in the app ever hands that URL to a client until
  promotion — so it is unreachable in practice even though technically
  public. **Known limitation vs. the letter of "signed/private URLs":**
  `@vercel/blob` does not currently support a private-with-signed-access
  mode the way S3 + CloudFront signed URLs do. If that's required at launch
  rather than as a fast-follow, the upgrade path is switching photo storage
  to S3 + CloudFront signed cookies/URLs — `quarantineStorage.ts`'s
  interface is written so only that one file changes.
- Rate limiting / upload quotas / abuse detection: not present anywhere in
  the codebase today (checked `proxy.ts` and `lib/`) — net new work, not an
  extension. Proposed: a small `lib/rateLimit.ts` backed by Postgres (an
  `UploadEvent`-style rolling count, consistent with this codebase's
  "no extra infra" bias — see `lib/upload.ts`'s own rationale for choosing
  Vercel Blob over S3) rather than introducing Redis just for this.
- Malware/file-type validation: `assertValidImage()` already checks MIME
  type and size; extend it to also validate actual file *content* (magic
  bytes) rather than trusting the declared `Content-Type`, since that's
  exactly the "renaming files / changing MIME types" bypass named in the
  request.

## 8. Privacy & data-retention model

Persisted, forever (needed for duplicate-account prevention and
legal/compliance — this is the "verification result" the request asks us to
keep instead of the document):

- `IdentityVerification.status`, `provider`, `documentType`, `documentHash`,
  `providerReference`, `dobMatchedProfile`, timestamps (`faceMatchScore` is
  a reserved, always-null column — see §2/§3 on why there's no face match
  to score).

Never persisted, anywhere, at any point:

- Aadhaar number, PAN number, passport number (full or partial beyond the
  DigiLocker-masked last-4 that arrives in the response we already don't
  request more of)
- The ID document image or PDF
- The DigiLocker access token (used once, in-memory, for the single
  document fetch, then discarded — not cached, not logged)

This mirrors the existing DPDP posture in `admin/docs/DPDP_COMPLIANCE.md`:
identity-verification data is included in that same `PrivacyRequest`
export/erasure flow (already a generic per-user data walk) with no special
casing needed, since nothing sensitive is stored outside the
`IdentityVerification` row described above.

## 9. Admin workflow

Extends the existing Trust & Safety console (`admin/app/(console)/...`)
rather than a new surface:

- **Photo Moderation Queue** (new page, under the existing moderation
  section) — lists `Photo` rows with `moderationStatus = MANUAL_REVIEW`,
  joined to their latest `PhotoModerationResult` (scores, reasons) and the
  linked `ModerationCase`. Approve/reject buttons call
  `POST /api/moderation/photos/[photoId]/decide`, gated by the existing
  `content.moderate` permission.
- **Identity Verification panel** (new section on the existing per-user
  admin page) — shows `IdentityVerification` status, provider, timestamps,
  DOB-match result, and duplicate-hash flag if any. Gated by a new,
  stricter permission `users.viewIdentityVerification` — deliberately
  separate from the existing `users.viewSensitivePII` (which unmasks
  email/phone/DOB/location) because identity-verification data touches
  government ID and should have a smaller admin population able to see it,
  per the request's "stricter access controls than ordinary moderation
  data." Every view is logged via the existing `AuditLogEntry` pattern
  (`action: "verification.view"`, `category: "moderation"`).
- `users.action.resetVerification` (already exists in `admin/lib/rbac.ts` —
  currently unused since there's no real verification flow to reset) is
  wired up to actually set `Profile.verification = UNVERIFIED` and log the
  action, same pattern as every other action in
  `admin/lib/userActions.ts`. This is now the **only** way out of a
  confirmed-underage `REJECTED` state: `POST /api/verification` returns a
  403 on retry when the user's latest `IdentityVerification.failureReason`
  is `'underage'`, so those rows sit in the queue until an admin
  investigates and, if warranted (e.g. a genuine document-read error),
  calls `resetVerification` explicitly — a minor can never simply
  resubmit their way to `VERIFIED`.
- Configurable thresholds (nudity score cutoffs) live in the existing
  `FeatureFlag`/config model rather than
  hardcoded constants, so Trust & Safety can tune false-positive/negative
  rates without a deploy — matches the existing `config.propose` /
  `config.approve` two-person pattern already in `rbac.ts`.

## 10. Automated test strategy

Three layers, matching the existing test setup (`scripts/verify-matching.ts`
shows the codebase's existing pattern of direct-DB integration scripts
alongside any framework tests):

**Unit — `lib/safety/policyEngine.test.ts`**: feeds the policy engine
*mocked* moderation-provider outputs (`{ nudityScores: { porn: 0.97 } }`,
`{ faceCount: 0 }`, `{ faceCount: 2 }`, etc.) and
asserts the resulting decision. **Explicitly does not use real explicit
images as test fixtures** — the whole point of mocking the provider layer is
that the decision logic is tested independently of any actual image,
so no nudity/CSAM-risk content is ever needed in the repo or CI. This
directly covers the request's "Explicit/nude image → rejected", "No face →
rejected", "Multiple faces → appropriate handling", "Cartoon → rejected"
(mocked as a high nsfwjs `Drawing` score) cases.

**Integration — API route tests**: a test user in each `VerificationStatus`
/ `User.status` combination, asserting `guards.requireVerifiedAndActive()`
blocks the unverified/suspended cases on `/api/discover`, swipe creation,
matches, and messages — covers "Unverified user attempting upload →
blocked", "Direct API bypass → blocked", "Suspended user → uploads
blocked".

**Integration — upload pipeline**: a real (non-explicit, checked-in) test
photo of a face runs through the actual quarantine → policyEngine →
promote path against the mocked provider, asserting a `Photo` row only
appears once `APPROVED`, and that `REJECTED` leaves no blob and no row —
covers "Image replacement → re-moderated", "Reported image → re-reviewed"
(by directly invoking the re-moderation trigger).

**Duplicate identity**: two mock verification attempts with the same
`documentHash` (e.g. `POST /api/verification?scenario=duplicate` from two
different test accounts) assert the second is `REJECTED` with
`failureReason: "duplicate_identity"` and opens a `ModerationCase`, not
silently blocked and not silently allowed.

**Underage (18+ gate)**: `POST /api/verification?scenario=underage` mocks
a document DOB 10 years before today; asserts `ageStatus: 'minor'`,
`Profile.verification: 'REJECTED'`, `failureReason: 'underage'`, and,
critically, that a subsequent retry (`POST /api/verification` again for
the same user) returns **403**, not a fresh `PENDING` attempt — this is
the one non-appealable outcome in the whole state machine and the test
exists specifically to prevent a regression that would let it be
self-resubmitted away.

**Name mismatch**: `POST /api/verification?scenario=name_mismatch` mocks
a document name (`"Someone Else Entirely"`) sharing no token with the test
profile's `displayName`; asserts `nameMatchesProfile: false`,
`Profile.verification: 'MANUAL_REVIEW'`, `failureReason: 'name_mismatch'`,
and that (unlike `underage`) a retry is still permitted — this is a
catfish *signal*, not a hard block, so a legitimate user whose document
uses a different name (marriage, transliteration, a name the profile
shortened) can still get a human to look rather than being locked out.

**Format coverage**: the upload-pipeline integration test (above) is
parameterized over a small fixture set — one real JPEG, one PNG, one WebP,
and one HEIC, all of the same non-explicit checked-in face photo re-encoded
per format — asserting all four decode successfully and reach the same
policy decision. A fifth fixture (a genuinely corrupt/truncated file with
an `image/*`-plausible name) asserts `UndecodableImageError` →
`REJECTED`, not `MANUAL_REVIEW` — this is the regression test for the
original "car pic still went through" bug class.

---

### Definition of done, honestly assessed against this design

Per the request's own standard — enforced identically regardless of web,
iOS, Android, direct API, or scripted request — this design achieves that
for every check except two, both called out rather than glossed over:
**AI-generated/deepfake-person detection has no free automated backstop**
(§3), and — because selfie-vs-ID face matching was explicitly descoped by
product decision (§2, §3) — **nothing here confirms the account's photos
show the same person who completed identity verification.** Everything
else — identity verification against a real government document (with a
hard, non-retryable 18+ gate computed from the document's own DOB, and a
name-token-overlap check against the profile's display name),
human-face presence across every common upload format (JPEG, PNG, WebP,
HEIC/HEIF), nudity/explicit content, and duplicate-account prevention — is
enforced server-side, in one code path, regardless of client.
