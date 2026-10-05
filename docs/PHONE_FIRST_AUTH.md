# Phone-First Auth + Trusted Devices + Passkeys — Design Spec

Status: **Decided — built 2026-10-05** (scope locked via in-chat
clarifying question: all four pieces below, existing accounts
grandfathered, 30-day trust duration)
Owner: Product / Platform
Related: `lib/trustedDevice.ts`, `lib/webauthn.ts`,
`lib/auth/webauthnChallenge.ts`, `lib/auth/appleOAuth.ts`,
`lib/auth/postAuthRedirect.ts`, `lib/auth/googleOAuth.ts` (the pattern
Apple mirrors), `lib/session.ts`, `lib/otp.ts`, `prisma/schema.prisma`
(`TrustedDevice`, `WebAuthnCredential`, `User.appleId`)

## 0. What this is, in one paragraph

Four related but separable changes to sign-in, built together because
they all came out of the same request. (1) **Trusted device**: after any
successful sign-in, this browser gets a rotating 30-day cookie that skips
OTP entirely on return visits — this is the actual fix for the real cost
driver (see §1). (2) **Phone-first signup**: new accounts can now only be
created by verifying a phone number; email sign-in no longer auto-creates
an account, and Google/Apple sign-ins without a verified phone are routed
through a one-time phone-verification gate before onboarding. Every
account that already existed is grandfathered in — nothing retroactive.
(3) **Apple Sign-In**: a real OAuth integration mirroring the existing
Google one, scaffolded and ready, but inert until the user supplies
Apple Developer credentials (see §5). (4) **Passkeys**: WebAuthn
registration and login, discoverable/resident credentials so a returning
user can sign in with no typed identifier at all.

## 1. Why "trusted device," not "fewer OTP methods"

The original ask framed this as a signup-method question — "let the user
use Passkey/Google/Apple/email after initial phone verification, so SMS
is only for initial verification + high-risk events." But the app
already had three equal, independent entry points (phone OTP, email OTP,
Google) — SMS cost was never driven by which method someone *signs up*
with. It was driven by `lib/sessionToken.ts`'s `IDLE_TIMEOUT_SECONDS` (10
minutes) cookie Max-Age, re-slid on every request by `proxy.ts` and
independently enforced client-side by
`components/InactivityLogout.tsx` — meaning anyone who closed the app and
came back more than 10 minutes later had to re-OTP from scratch,
*regardless* of which method they originally signed up with. That's the
actual SMS/email bill driver, and it's a session-lifetime problem, not a
method-choice problem.

So "trusted device" (§2) is the piece that actually moves the cost
number: a long-lived, separate-from-the-session cookie that lets a
returning visit skip straight past OTP into a brand-new session, without
touching the 10-minute idle timeout itself (that timeout still protects
an *active, abandoned* tab exactly as before — these are two different
mechanisms layered on top of each other, not one replacing the other).
Phone-first signup, Apple, and passkeys (§3-§5) are the other three
pieces of the original ask, each independently useful, but none of them
is what the SMS bill was actually about.

## 2. Trusted device

`lib/trustedDevice.ts`. A `TrustedDevice` row per device, not per user —
a user with three devices accumulates three rows, each independently
revocable:

```prisma
model TrustedDevice {
  id         String   @id @default(cuid())
  userId     String
  tokenHash  String   @unique
  createdAt  DateTime @default(now())
  lastUsedAt DateTime @default(now())
  expiresAt  DateTime
  userAgent  String?
  ip         String?
}
```

- **Opaque, rotating, hashed.** The cookie (`findmyvybe_device`, 30-day
  Max-Age) holds a random token; only its sha256 hash is stored. Every
  successful use (`consumeTrustedDevice()`) deletes that row and issues a
  brand-new token + row in the same request — a stolen cookie value is
  worthless after its first use, and a legitimate returning user's trust
  window quietly extends another 30 days on every visit rather than
  counting down to a hard expiry.
- **Issued on every successful sign-in**, regardless of method —
  phone OTP, email OTP, Google, Apple, and passkey login all call
  `issueTrustedDevice(userId)` right after `createSession(...)`. One
  mechanism, not one per method.
- **Checked silently on page load.** `app/login/page.tsx` fires
  `POST /api/auth/device-login` the moment it mounts, before rendering
  the sign-in form at all; a returning, trusted visitor sees a brief
  "Checking this device…" screen and lands straight on `/discover` (or
  wherever `nextPathAfterAuth` sends them) with zero OTP. Only a visitor
  with no valid trusted-device cookie ever sees the actual form.
- **Revocation is symmetric with session revocation.** Everywhere
  `sessionsInvalidatedAt` is touched to force a session dead (self-service
  account deletion, admin ban, admin force-logout, admin account
  anonymization), the matching `TrustedDevice` rows are deleted in the
  same transaction — "this account's login state is no longer trusted"
  means the same thing both ways. There's deliberately no exported
  `revokeAllTrustedDevices()` helper in `lib/trustedDevice.ts`: the one
  root call site (`/api/me/delete`) needs the delete inside its existing
  `$transaction` array directly, and the admin app can't import the root
  app's `lib/` anyway (separate Prisma clients, separate `@/*` aliases —
  see the repo-wide note on this in `admin/`'s own files).

## 3. Phone-first signup, with existing accounts grandfathered

"Phone gives a stronger anti-fake-account signal than email, because a
fresh email is nearly free" was the premise. The gate:

- **`POST /api/auth/request-otp` (phone) is now the only auto-creating
  signup entry.** Unchanged behavior for phone itself — it already
  created-or-found by phone number.
- **`POST /api/auth/request-email-otp` no longer creates a user.** If no
  account exists for that email, it 404s with "No account found for that
  email yet — sign up with your phone number first, then add email from
  your profile." Existing accounts that sign in with email continue to
  work exactly as before (that's the grandfathering — see below).
- **Google and Apple sign-in still create an account on first use**
  (removing that would make them useless as signup methods, which wasn't
  the ask), **but land anyone without a verified phone on
  `/verify-phone`** instead of `/onboarding` — a mandatory, one-screen
  phone-OTP gate (`app/verify-phone/page.tsx`) before they can create a
  profile.
- **Grandfathering has no separate flag or migration.** The gate
  condition is simply "no `Profile` row yet AND no verified phone" —
  `lib/auth/postAuthRedirect.ts`'s `nextPathAfterAuth`:

  ```ts
  function nextPathAfterAuth(user) {
    if (user.profile) return '/discover';       // existing user, done
    if (!user.phoneVerified) return '/verify-phone'; // new, no phone yet
    return '/onboarding';                         // phone verified, no profile yet
  }
  ```

  Anyone who already has a `Profile` row — which is everyone who signed
  up before this change — takes the first branch and never sees the
  gate, on any device, forever. The mandatory-phone requirement only ever
  applies to the window between "account created" and "profile
  completed," which for an old account closed long ago.
- **Adding phone/email later is a different code path from signing in.**
  New authenticated routes under `/api/profile/phone/*` and
  `/api/profile/email/*` attach an identifier to *the currently signed-in
  session*, structurally distinct from `/api/auth/*`'s "look up or create
  by identifier" — so a grandfathered email-only user adding their phone
  from Account & Security can never accidentally create a second account.

This is also the first place a response-contract change touches every
sign-in call site: every verify/callback route now returns `{ ok, next:
<path> }` instead of `{ ok, hasProfile: <bool> }`, and every client call
site does `router.push(data.next ?? '/discover')` instead of its own
`hasProfile ? ... : ...` ternary — one decision function, not four
copies of the same branch drifting independently.

## 4. Apple Sign-In (scaffold, inert until configured)

`lib/auth/appleOAuth.ts`, mirroring `lib/auth/googleOAuth.ts` almost
exactly — same `isAppleOAuthConfigured()` / `buildAppleAuthorizationUrl(state)`
/ `exchangeAppleCodeForProfile(code)` shape, same signed-JWT `state` CSRF
pattern (`lib/auth/oauthState.ts`, now typed for
`'google' | 'apple'`), same mock-consent fallback
(`app/api/auth/mock-apple/route.ts`) when unconfigured, same beta
allowlist / DELETED-account / `P2002` collision handling in the callback.
Two real differences from Google, both forced by Apple's own protocol,
not a design choice:

- **`response_mode=form_post`** — Apple POSTs the callback instead of
  redirecting with a query string, so `app/api/auth/apple/callback/route.ts`
  is a POST handler reading `req.formData()`, where Google's is a GET
  handler reading `searchParams`.
- **No static client secret.** Apple requires a short-lived ES256 JWT,
  self-minted per token exchange from a private key
  (`APPLE_PRIVATE_KEY`) via `jose`'s `importPKCS8` — there's no long-lived
  secret string to paste into an env var the way Google's
  `GOOGLE_CLIENT_SECRET` works.

Needs four env vars (`APPLE_TEAM_ID`, `APPLE_CLIENT_ID`, `APPLE_KEY_ID`,
`APPLE_PRIVATE_KEY` — see `.env.example`) and an active Apple Developer
Program enrollment, which is a paid, manual, outside-this-codebase step
only the account owner can do. Until those are set, "Continue with
Apple" behaves exactly like Google's own unconfigured fallback: a mock
consent screen, fully testable, zero external calls.

## 5. Passkeys

`@simplewebauthn/server` / `@simplewebauthn/browser` (v14). One new
table:

```prisma
model WebAuthnCredential {
  id           String   @id @default(cuid())
  userId       String
  credentialId String   @unique
  publicKey    Bytes
  counter      Int      @default(0)
  transports   String[] @default([])
  deviceType   String
  backedUp     Boolean  @default(false)
  label        String
  createdAt    DateTime @default(now())
  lastUsedAt   DateTime @default(now())
}
```

- **Discoverable credentials** (`residentKey: 'preferred'`) — a passkey
  login needs no typed phone/email first; the browser's own passkey
  picker supplies the identity. `generateAuthenticationOptions` is
  called with no `allowCredentials` for this reason.
- **RP ID spans all three real hosts from one value.**
  `lib/webauthn.ts`'s `webauthnRpID()` strips a leading `dev.` from
  `NEXT_PUBLIC_APP_URL`'s hostname — a credential registered for
  `findmyvybe.com` is valid on `dev.findmyvybe.com` too, since WebAuthn
  treats an RP ID as covering the whole domain, not one subdomain — and
  falls back to `'localhost'` for local dev (which can't share an RP ID
  with a real domain at all). `webauthnExpectedOrigins()` lists every
  concrete origin (configured + its dev-prefixed counterpart +
  localhost) since `expectedOrigin` verification is exact-match, no
  wildcarding.
- **Registration and login are each a two-step options/verify pair**,
  the standard WebAuthn ceremony shape:
  `/api/profile/passkey/register-options` → `startRegistration` (client)
  → `/api/profile/passkey/register-verify`; and unauthenticated
  `/api/auth/passkey/login-options` → `startAuthentication` (client) →
  `/api/auth/passkey/login-verify`. A short-lived, httpOnly, unsigned
  challenge cookie (`lib/auth/webauthnChallenge.ts`, 5-minute TTL) ties
  the two steps together — unsigned because httpOnly already prevents
  client-side tampering, and the challenge is single-use/short-lived
  either way.
- **A successful passkey login also issues a trusted-device cookie**
  (§2) — the two mechanisms stack; a passkey sign-in on a brand-new
  browser still gets the 30-day skip-OTP cookie for next time.
- Managed from Profile → Account & Security
  (`components/AccountSecuritySection.tsx`): add a passkey, see a
  crude-but-readable label per credential (`labelFromUserAgent` — e.g.
  "Chrome on Mac"), remove one.

## 6. Account & Security (Profile screen)

New section on `/profile`, directly above the existing danger zone,
surfacing everything above in one place:

- **Phone** — masked number + "Verified" badge once set; "Add phone" (a
  two-step OTP flow identical in shape to the mandatory gate) for anyone
  who doesn't have one yet — grandfathered accounts, mainly.
- **Email** — same pattern, same masking.
- **Google / Apple** — read-only linked/not-linked badges. Unlinking a
  social login isn't offered here; out of scope for this change.
- **Passkeys** — list + add/remove, described in §5.

`GET /api/profile` now returns an `account` object alongside the
existing `profile` (phone, phoneVerified, email, emailVerified,
googleLinked, appleLinked, passkeys) — deliberately exposing *presence*
for Google/Apple, never the provider's internal id string, since the
client only ever needs to know "is this linked," not the id itself.

## 7. What's explicitly deferred, not forgotten

- Unlinking Google/Apple from Account & Security.
- A "high-risk event" re-verification trigger (new device country, new
  payment method, etc.) that would force a fresh OTP even with a valid
  trusted-device cookie — the original request mentioned this as a
  future refinement, not part of this build.
- Surfacing/managing individual `TrustedDevice` rows ("sign out this
  device") from Account & Security — today a user can only sign out
  everywhere (self-service delete) or get force-logged-out by admin;
  there's no per-device list yet.
- Fixing the pre-existing `.length(8)` OTP-code Zod validation
  inconsistency noticed during this work (`lib/otp.ts` generates 6-digit
  real codes but several schemas validate an 8-character length,
  matching only the `MOCK_OTP` fallback's length) — left alone as
  out-of-scope for this change.

## 8. Decision trail (chat, 2026-10-05)

- Request arrived framed as "reduce the SMS bill by choosing cheaper
  signup methods." Research showed the actual cost driver was the
  10-minute idle session timeout forcing re-OTP on every return visit,
  not the signup method itself — this reframed trusted-device as the
  highest-leverage piece, independent of which of the other three got
  built.
- Asked (in chat, via a structured clarifying question) which of the
  four pieces to build, whether to require phone retroactively on
  existing accounts, and how long a trusted device should stay trusted.
  Answered: all four pieces (overriding a suggestion to defer passkeys),
  grandfather existing accounts with no retroactive requirement, 30
  days.
