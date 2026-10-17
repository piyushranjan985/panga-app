# Payments & Monetization

Mock-mode payment system for FindMyVybe's hybrid pricing model (a base
subscription per intent, plus optional one-off credit packs). Implemented
additively: nothing pre-existing was changed except `admin/lib/rbac.ts`
(two new permissions) and `prisma/schema.prisma` (new models only, see
below).

**Everything in this system is mock-mode only.** No gateway (Razorpay,
Cashfree, or PayU) has a real integration. Flipping every flag below to
their most-permissive values still never calls out to a real gateway,
because `lib/payments/razorpayAdapter.ts` is a shape-matching stub that
throws on every call -- see "Going live" at the bottom of this doc for
what that would actually require.

## The two flags that gate everything

Two plain, server-only environment variables -- never admin-mutable,
never read from the database. Both the root app (`lib/payments/flags.ts`)
and the admin app (`admin/lib/payments/flags.ts`) implement the exact
same logic independently (the two Next.js apps don't share a lib tree),
so **both must be set to the same values** in each deployment environment.

| `Free_Tier` | `PAYMENT_MODE` | `LIVE_PAYMENTS_CONFIRMED` | Checkout reachable? | Real money moves? |
|---|---|---|---|---|
| `true` (or unset/invalid) | any | any | No | No |
| `false` | unset/invalid | any | Mock only | No |
| `false` | `mock` | any | Mock only | No |
| `false` | `live` | not `true` | Mock only (fails safe) | No |
| `false` | `live` | `true` | Yes | **Yes -- the only row** |

Every unset/invalid value fails safe toward the top row. `Free_Tier=false`
never by itself enables live payments -- `PAYMENT_MODE` and
`LIVE_PAYMENTS_CONFIRMED` are independent switches on purpose, so no
single flag flip can move real money. This matrix is tested in full in
`tests/paymentFlags.test.ts` (root) and `admin/tests/paymentFlags.test.ts`
(admin), including that the two flags vary independently of each other.

A third env var, `GST_SUPPLIER_STATE_CODE` (default `"DL"`), is a
placeholder for FindMyVybe's actual GST-registered state -- it only
affects which GST split (CGST+SGST vs IGST) a mock invoice shows, and is
harmless while `PAYMENT_MODE=mock`. Confirm the real value with a CA
before going live.

## Schema

All additive -- see `prisma/schema.prisma`'s "Payments & Monetization"
section (search for that heading) for full model comments. Summary:

- `PaymentPlan` -- one row per plan **version**. Editing a plan in the
  admin portal creates a new row and deactivates the old one; it never
  mutates a row a live `Subscription`/`Transaction` already references.
- `Subscription` -- one per user, references a specific `PaymentPlan`
  version.
- `Transaction` -- one per checkout **attempt** (not only successes).
  `idempotencyKey` is unique.
- `TransactionEvent` -- append-only log of every state-changing event for
  a transaction, unique on `(transactionId, eventType, externalEventId)`
  -- the real idempotency/out-of-order guard, see below.
- `Invoice` -- created on a successful transaction, GST-broken-down,
  `isMock: true` while `PAYMENT_MODE=mock`.
- `PromoCode` / `PromoRedemption` -- percent/flat discounts, usage-capped.
- `CreditBalance` / `CreditLedgerEntry` -- the credit-pack side of the
  hybrid model; `CreditLedgerEntry` is the append-only source of truth,
  `CreditBalance` a denormalized running total.
- `GatewayConfig` -- display-only, non-secret planning rows for the admin
  Gateway Configuration screen. Does **not** control whether live
  payments are reachable -- only the env flags above do that.

The migration (`prisma/migrations/20261017120000_add_payments_domain`)
was applied directly via `prisma db execute` and recorded by hand via
`prisma migrate resolve --applied`, rather than through a normal
`prisma migrate dev` run. That command refused to proceed without a full
`prisma migrate reset` (which drops the dev database) because it detected
pre-existing drift on two unrelated, already-applied migrations
(`20260926120000_identity_verification_and_photo_moderation` and
`20260927000000_add_admin_trust_safety_backend` -- their on-disk files
had been edited after being applied, most likely for documentation). That
drift is not something this build caused or touched; the dev database
was never reset, and the generated SQL diff was hand-filtered to drop two
unrelated statements the diff tool also surfaced (an index drop/recreate
on `Swipe` and a `DROP DEFAULT` on `Profile.geoLocation`) before applying
only the genuinely new Payments tables/enums/indexes/foreign keys.

## Code layout

```
lib/payments/                      (root app)
  flags.ts            Free_Tier / PAYMENT_MODE / LIVE_PAYMENTS_CONFIRMED readers
  types.ts            FeatureKey / CreditFeatureKey entitlement vocabulary
  money.ts            paise <-> rupee helpers
  gst.ts              GST calculation (CGST+SGST vs IGST)
  discount.ts          promo discount math
  idempotency.ts       idempotency key + mock event id generation
  gatewayAdapter.ts     the PaymentGatewayAdapter interface
  mockGatewayAdapter.ts the only adapter ever constructed while PAYMENT_MODE=mock
  razorpayAdapter.ts    shape-matching stub; every method throws (see "Going live")
  gatewayFactory.ts     the ONE place that picks mock vs. real
  entitlements.ts       getEntitlements() / hasFeature() / spendCredits()
  checkout.ts           createCheckout() / confirmCheckout() / applyGatewayEvent()

app/api/payments/                  (root app, consumer-facing)
  plans/route.ts                        GET -- active plans for the user's intent
  checkout/route.ts                     POST -- create a checkout (blocked by Free_Tier)
  checkout/[transactionId]/confirm/route.ts  POST -- mock "payment finished" callback
  subscription/route.ts                 GET -- current user's entitlements
  webhook/route.ts                      POST -- real-gateway-webhook-shaped parity endpoint

admin/lib/payments/                (admin app -- duplicated pure logic + DB helpers)
  flags.ts, money.ts, types.ts    duplicates of the root app's versions
  plans.ts             createPlanVersion() / setPlanActive() / listPlanCatalog()
  subscriptions.ts      listSubscriptions() / cancelSubscription()
  reports.ts            getGstSummary() / getPromoUsageSummary()
  gatewayConfig.ts      ensureGatewayConfigRows() / setGatewayEnabledForLive()

admin/app/(console)/payments/      (admin app -- the 6 screens)
  page.tsx              Overview (stat tiles + the live Free_Tier/PAYMENT_MODE banner)
  plans/page.tsx         Plans & pricing (version history, create-new-version form)
  transactions/page.tsx  Transactions (filter by status, CSV export)
  subscriptions/page.tsx Subscriptions (manual cancel, step-up required)
  reports/page.tsx       Reports & compliance (GST summary, promo usage, CSV export)
  gateway/page.tsx        Gateway configuration (planning-only toggles + the flag banner)

admin/app/api/payments/            matching API routes behind requirePermission()
```

## Entitlements

`lib/payments/entitlements.ts`'s `getEntitlements(userId)` is the single
source of truth for "what can this user do right now" -- computed fresh
on every call, never cached on the `User`/`Profile` row. `Free_Tier` is
checked **first** and short-circuits everything else, so a stale
"isPremium" flag can never survive a `Free_Tier` flip. Two kinds of
entitlement:

- **`FeatureKey`** (on/off, subscription-gated): `unlimited_swipes`,
  `see_who_liked_you`, `advanced_filters`, `rewind_last_swipe`,
  `priority_placement`, `extra_vybe_vouch_invites`, `read_receipts`.
- **`CreditFeatureKey`** (one-off, spent via `spendCredits()`):
  `profile_boost`, `super_like`, `profile_spotlight`. (An earlier draft
  also listed `assisted_shortlist_review` -- deliberately dropped per
  your explicit instruction: it didn't map to any existing feature in
  the app, and building one to fit it would have been a guess at an
  unscoped product idea rather than wiring up something real. If a
  "matchmaking review" feature gets designed later, it gets its own
  `CreditFeatureKey` added fresh.)

**Safety features are never in either list** -- identity verification,
reporting/blocking, content moderation, account recovery, force logout,
and data-privacy rights have no `FeatureKey`, so there is no code path
that could gate them behind a paid plan. An admin creating a plan can
only ever grant a key from this fixed list (`admin/app/api/payments/
plans/route.ts` filters the submitted features against it) -- there's no
freeform "feature name" field to accidentally misuse.

## Feature enforcement (Oct 2026 pass)

Every `FeatureKey`/`CreditFeatureKey` above is wired into real,
server-side-enforced behavior -- a purchase actually does something.
**All of it is inert while `Free_Tier` is on** (today's default): every
gate below is written against `isFeatureLocked(entitlements, key)`
(`lib/payments/entitlements.ts`), which is defined to return `false`
outright whenever `entitlements.freeTier` is `true`, regardless of the
per-feature flag -- see that function's doc comment for why checking
`hasFeature()`/`entitlements.features[key]` alone would get this
backwards. **Wiring a new gate** means: fetch `getEntitlements(userId)`
once, then guard with `isFeatureLocked(entitlements, key)` -- never
`!entitlements.features[key]` on its own.

| Key | Where it's enforced | What it does |
|---|---|---|
| `unlimited_swipes` | `app/api/swipe/route.ts` | A second, lower, monetization-only daily swipe cap (`lib/payments/swipeCap.ts`, default 20/day via `SWIPE_FREE_DAILY_CAP`) -- completely separate from `lib/swipeRateLimit.ts`'s 50/day abuse/cost safety valve, which still applies to everyone regardless of plan. |
| `see_who_liked_you` | `GET /api/discover/liked-you` (new route) | Lists incoming VYBEs that haven't become a mutual Match or been decided on yet. A locked caller still gets an accurate `count` (for the upgrade nudge), just not the profile list. |
| `advanced_filters` | `app/api/discover/search/route.ts` | Gates the **entire** Search route (structured filters -- age/distance/gender/intent/interests/tribes -- and the free-text box, which only ever resolves to the same fields). The ordinary, unfiltered Discover feed (`app/api/discover/route.ts`) is unaffected -- that's a separate route and was never part of this gate. **Note:** this endpoint was previously reachable by every user with no entitlement check at all; this pass intentionally locks it, per your explicit choice, rather than leaving today's free users with filters a paid plan is supposed to sell. |
| `rewind_last_swipe` | `POST /api/swipe/rewind` (new route) | Deletes the caller's single most recent `Swipe` row, unless it already formed a Match (a real match can only be ended via the normal unmatch flow). |
| `priority_placement` | `app/api/discover/route.ts` via `lib/payments/visibilityBoost.ts` | A score bonus added on top of `lib/matching.ts`'s ordinary ranking for any pool member with an ACTIVE subscription whose plan grants this key -- `lib/matching.ts` itself stays free of any payments concept. |
| `extra_vybe_vouch_invites` | `app/api/matches/[matchId]/vouch/route.ts` via `lib/vybeVouch.ts`'s `vouchPendingCap()` | Raises the per-match pending-invite cap from 3 to 5. |
| `read_receipts` | `GET /api/matches/[matchId]/messages/route.ts` | The recipient's read state (`Message.status`) is always tracked accurately on write; a non-entitled caller's own *sent* messages are masked back down to `DELIVERED` in the API response so they can't see when they were actually read. |
| `super_like` (credit) | `POST /api/swipe/super` (new route) | Same swipe/match mechanics as an ordinary swipe, plus `Swipe.isSuperLike` (new, additive column) and an immediate push to the recipient if it didn't form a mutual match outright. |
| `profile_boost` / `profile_spotlight` (credit) | `POST /api/boosts` (new route) + `lib/payments/visibilityBoost.ts` | Same score-bonus mechanism as `priority_placement`, for a fixed window after the spend (Boost: 30 min, a smaller bonus; Spotlight: 4 hours, a bigger one) -- read back from the `CreditLedgerEntry` the spend itself already writes, no new "active until" column needed. |

## Idempotency and out-of-order events

Two independent guards, both exercised end-to-end by
`scripts/smoke-test-payments.ts`:

1. **`Transaction.idempotencyKey`** (unique) -- a retried
   `createCheckout()` call with the same key returns the existing
   transaction instead of creating a second one.
2. **`TransactionEvent` unique on `(transactionId, eventType,
   externalEventId)`** -- a duplicate or out-of-order event (a retried
   mock confirm, or a real webhook redelivery) is caught at the database
   level; `applyGatewayEvent()` treats the resulting unique-constraint
   violation as "already applied", not an error. A terminal transaction
   status (`SUCCEEDED`/`FAILED`/`REFUNDED`) is never overwritten by a
   late-arriving `PENDING` event for the same transaction.

The mock adapter generates a deterministic `externalEventId` (`mock-
<gatewayOrderId>-<eventType>-<gatewayPaymentId>`) specifically so this
guard also catches a duplicate *mock* event, not only a duplicate real
webhook delivery.

## Server-side trust boundary

`createCheckout()` never trusts a client-supplied price, plan, or
discount -- it always re-reads the `PaymentPlan` row and recomputes
amount/discount/GST/total itself. `confirmCheckout()`'s `simulate` field
(the only way a client can influence the outcome) is silently ignored
unless `PAYMENT_MODE=mock`, so it can never be used to fabricate a live
entitlement. No entitlement is ever granted from a client-asserted
"success" alone -- only from `applyGatewayEvent()` processing an actual
adapter result (today, the mock adapter's deterministic simulation; once
live, a signature-verified gateway webhook).

## Testing

- `tests/paymentFlags.test.ts`, `tests/paymentMath.test.ts`,
  `tests/mockGatewayAdapter.test.ts` (root) and `admin/tests/
  paymentFlags.test.ts`, `admin/tests/paymentRbac.test.ts` (admin) --
  DB-free `node:test` unit tests, same convention as every other
  `tests/*.test.ts` file in this project (no Prisma import, so `npm test`
  never needs a database).
- `npm run db:smoke-test:payments` -- the DB-touching integration check
  (mirrors `prisma/smoke-test-match.ts`'s convention): full plan
  lifecycle, every mock checkout outcome, idempotent re-entry, duplicate/
  out-of-order event handling, subscription + credit-pack entitlement
  grants, promo discounting, and that `Free_Tier=true` blocks checkout
  end-to-end. All 22 checks pass against the real dev database as of this
  writing.
- Full regression: `npm test` (root, 80/80), `admin`'s `npm test`
  (35/35), `npm run verify:matching` (20/20), `npm run verify:mystery-
  match` (7/7), `npm run typecheck` and `npm run lint` clean on both apps
  for every payments file, and a full production `npm run build` on both
  apps. The pre-existing lint errors elsewhere in the codebase (`@ts-
  ignore` usages, a couple of `react-hooks/purity` findings) are
  unrelated to this change -- confirmed identical in count on `develop`
  before these payments files existed.

## Seeding a starter catalog

`npm run db:seed:payments` creates five starter plans (idempotent, safe
to re-run): `vybe-plus` / `real-plus` / `rishta-premium` (one subscription
per intent) and `boost-pack-5` / `boost-pack-15` (universal credit
packs). **These are starter defaults for testing against, not final
pricing** -- every number is immediately editable from Payments > Plans &
pricing in the admin portal (each edit creates a new version; see the
Schema section above).

## Admin portal

Six screens under `/payments`, all gated by `requirePageAccess`/
`requirePermission`, all audit-logged via the existing `writeAudit()`
pattern (category `payments`): Overview, Plans & pricing, Transactions,
Subscriptions, Reports & compliance, Gateway configuration. Two new
permissions in `admin/lib/rbac.ts`:

- `payments.manage` -- create plan versions, activate/deactivate a plan,
  toggle a gateway's planning status. Granted to `FINANCE`, `ADMIN`,
  `SUPER_ADMIN`.
- `payments.subscriptions.override` -- manually cancel a subscription.
  Also in `STEP_UP_REQUIRED` (same bar as `users.action.ban`), since this
  changes a real subscriber's access.

## Going live (not implemented here)

This build deliberately stops short of a real gateway integration. Going
live for real would need, at minimum:

1. **Written merchant-category confirmation** from whichever gateway is
   chosen -- Razorpay's published rules treat dating/matchmaking as a
   restricted category subject to case-by-case approval; this is not
   something achievable from inside this codebase.
2. A real `PaymentGatewayAdapter` implementation replacing `lib/payments/
   razorpayAdapter.ts`'s throwing stub, with real API credentials in
   environment variables (never the database) and real webhook signature
   verification.
3. `FindMyVybe`'s actual `GST_SUPPLIER_STATE_CODE`, confirmed by a CA,
   and a CA's sign-off on the GST treatment more broadly.
4. An updated Terms of Service -- see `docs/TOS_PAYMENT_UPDATE_DRAFT.md`
   for the drafted replacement language, prepared now per your request
   but not yet published (the current, still-live Terms correctly says
   there's no paid tier, which remains true in substance while
   `Free_Tier`/mock mode are on).
5. Setting `Free_Tier=false`, `PAYMENT_MODE=live`, and
   `LIVE_PAYMENTS_CONFIRMED=true` as real deployment environment
   variables (on both the root and admin Vercel projects) and
   redeploying -- nothing in the admin portal can do this for you, by
   design.
