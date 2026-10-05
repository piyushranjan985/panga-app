# Phone-First Auth + Trusted Devices + Passkeys — Design Spec

Status: **Decided — built 2026-10-05, revised 2026-10-05** (scope
locked via in-chat clarifying questions: all four pieces below,
existing accounts grandfathered, 30-day trust duration; Apple
Sign-In then removed, email made mandatory at signup, and a quiet
email-OTP fallback added for returning sign-ins -- see §8)
Owner: Product / Platform
Related: `lib/trustedDevice.ts`, `lib/webauthn.ts`,
`lib/auth/webauthnChallenge.ts`, `lib/auth/postAuthRedirect.ts`,
`lib/auth/googleOAuth.ts`, `lib/session.ts`, `lib/otp.ts`,
`components/EmailVerifyField.tsx`, `prisma/schema.prisma`
(`TrustedDevice`, `WebAuthnCredential`)

## 0. What this is, in one paragraph

Four related but separable changes to sign-in, built together because
they all came out of the same request. (1) **Trusted device**: after any
successful sign-in, this browser gets a rotating 30-day cookie that skips
OTP entirely on return visits — this is the actual fix for the real cost
driver (see §1). (2) **Phone-first signup**: new accounts can now only be
created by verifying a phone number; email sign-in no longer auto-creates
an account, and a Google sign-in without a verified phone is routed
through a one-time phone-verification gate before onboarding. Every
account that already existed is grandfathered in — nothing retroactive.
(3) **Apple Sign-In**: built as a real OAuth integration mirroring
Google's, scaffolded and ready but never configured with real
credentials, then removed entirely by a later product decision (see
§4, §8) in favor of (3') **a quiet email-OTP fallback**: a returning
sign-in with a verified email on file gets its code emailed instead
of texted, with no change to what the user types (see §3). (4)
**Passkeys**: WebAuthn registration and login, discoverable/resident
credentials so a returning user can sign in with no typed identifier
at all.

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
Phone-first signup, Apple (later replaced by the quiet email-OTP
fallback in §3), and passkeys (§3-§5) are the other three pieces of
the original ask, each independently useful, but none of them is
what the SMS bill was actually about.

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
  phone OTP, email OTP, Google, and passkey login all call
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
- **Google sign-in still creates an account on first use** (removing
  that would make it useless as a signup method, which wasn't the ask),
  **but lands anyone without a verified phone on `/verify-phone`**
  instead of `/onboarding` — a mandatory, one-screen phone-OTP gate
  (`app/verify-phone/page.tsx`) before they can create a profile.
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
- **Email is mandatory at the Bio (`basics`) onboarding step for a
  brand-new signup** (revised 2026-10-05, see §8's second decision
  entry), verified inline before `Next` unlocks
  (`components/EmailVerifyField.tsx`, reusing the same
  `/api/profile/email/request-otp` + `/verify-otp` pair Account &
  Security already used). Not re-required of an existing account
  revisiting Basics via `switchIntent` — `app/onboarding/page.tsx`'s
  `nextDisabled` only applies the gate when `!editMode`.
- **A returning sign-in's OTP quietly prefers email over SMS.** The
  login screen still only ever asks for a phone number — there's no
  second tab or toggle to notice — but `POST /api/auth/request-otp`
  checks `existing.phoneVerified && existing.email &&
  existing.emailVerified` and, when all three hold, issues the code to
  that email instead of by SMS. `phoneVerified` (not just row
  existence) is required so a half-finished signup can't skip phone
  verification on its first real attempt. The response's `channel`/
  `maskedDestination` tell `/verify` which destination the code
  actually went to, so it says "we sent a code to j***@gmail.com"
  rather than implying a text message that was never sent —
  `lib/otp.ts`'s `consumeOtp` resolves the real channel from the
  `OtpCode` row itself (not the caller's guess) so the session's
  recorded `method` (`phone_otp` vs `email_otp`) stays accurate too. A
  brand-new signup always goes by SMS — there's no verified email yet
  to fall back to, and phone is still this app's anti-fake-account
  signal for a first account.

This is also the first place a response-contract change touches every
sign-in call site: every verify/callback route now returns `{ ok, next:
<path> }` instead of `{ ok, hasProfile: <bool> }`, and every client call
site does `router.push(data.next ?? '/discover')` instead of its own
`hasProfile ? ... : ...` ternary — one decision function, not four
copies of the same branch drifting independently.

## 4. Apple Sign-In (removed 2026-10-05)

Was a working scaffold mirroring `lib/auth/googleOAuth.ts` almost
exactly -- same `isAppleOAuthConfigured()` / `buildAppleAuthorizationUrl(state)`
/ `exchangeAppleCodeForProfile(code)` shape, same signed-JWT `state` CSRF
pattern, same mock-consent fallback when unconfigured, same beta
allowlist / DELETED-account / `P2002` collision handling in the
callback. Its four env vars (`APPLE_TEAM_ID`, `APPLE_CLIENT_ID`,
`APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`) were never set in any environment
-- "Continue with Apple" always ran the mock-consent fallback, never a
real OAuth round trip.

Removed by product decision (see §8's second entry) in favor of a
phone-first identity plus a quiet email-OTP fallback for returning
sign-ins (§3) instead of a third OAuth provider to maintain:
`lib/auth/appleOAuth.ts`, `app/api/auth/apple/`,
`app/api/auth/mock-apple/` deleted outright; `User.appleId` dropped
(`prisma/migrations/20261010090000_remove_apple_auth`, same lossless-drop
reasoning as `20260929210000_remove_facebook_auth`'s `facebookId`
drop -- see that migration's own comment); `lib/auth/oauthState.ts`'s
`SocialProvider` narrowed to `'google'`; `app/login/page.tsx` down to one
social button. A historical note lives in that file's comments, same
pattern as the existing Instagram/Facebook removal notes there.

**Before any future App Store submission**, re-check Apple's Guideline
4.8 (Sign in with Apple): it can require offering Apple sign-in again
as long as Google sign-in stays available. Not re-checked as part of
this removal since there's no App Store submission imminent -- flagged
here so it isn't assumed moot just because the code is gone from the
web app.

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
- **Email** — same pattern, same masking (`components/EmailVerifyField.tsx` --
  also what the onboarding Bio step uses for its own, now-mandatory,
  email capture; see §3).
- **Google** — a read-only linked/not-linked badge. Unlinking a social login
  isn't offered here; out of scope for this change. (Was "Google /
  Apple" until Apple Sign-In was removed 2026-10-05 -- see §4.)
- **Passkeys** — list + add/remove, described in §5.

`GET /api/profile` now returns an `account` object alongside the
existing `profile` (phone, phoneVerified, email, emailVerified,
googleLinked, passkeys) — deliberately exposing *presence* for Google,
never the provider's internal id string, since the client only ever
needs to know "is this linked," not the id itself.

## 7. What's explicitly deferred, not forgotten

- Unlinking Google from Account & Security.
- A "high-risk event" re-verification trigger (new device country, new
  payment method, etc.) that would force a fresh OTP even with a valid
  trusted-device cookie — the original request mentioned this as a
  future refinement, not part of this build.
- Surfacing/managing individual `TrustedDevice` rows ("sign out this
  device") from Account & Security — today a user can only sign out
  everywhere (self-service delete) or get force-logged-out by admin;
  there's no per-device list yet.
- No automatic SMS fallback if the email provider fails for a returning
  sign-in that got silently routed to email (§3) — `issueOtp` just
  returns `send_failed`/`provider_not_configured` like any other failed
  send, with no retry on the other channel. Brevo's uptime has been fine
  so far; revisit if this becomes a real support complaint.
- Re-checking Apple's App Store Guideline 4.8 (see §4) before any real
  App Store submission.

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
- Second round, same day: asked to (1) remove Apple Sign-In completely,
  and (2) "make sure phone OTP isn't used much, ideally only for 1st-
  time signup" -- offered as a rough idea (ask for phone at signup,
  then email on the next/Bio screen, linked to the phone) with an
  explicit invitation to expand and improve it, not a locked spec.
  Researched the existing onboarding flow (the "Bio screen" is the
  `basics` onboarding step) and this repo's Facebook-removal precedent
  (`20260929210000_remove_facebook_auth`) before proposing anything.
  Asked three clarifying questions (in chat): email at signup required-
  and-verified-inline vs. optional-with-a-nudge; the returning-login
  channel switch automatic-and-silent vs. a visible default-tab flip;
  and whether to also drop the `appleId` column (matching the Facebook
  precedent) or just leave it unused. Answered: required + verified
  inline, automatic + silent, drop the column. Built as the "quiet
  fallback" design in §3 rather than the originally-sketched two-tab
  manual version, reusing the existing destination/channel/purpose
  columns from the OTP security hardening pass (`docs/OTP_SECURITY.md`)
  rather than adding new ones. Also fixed, as a drive-by: four
  `verify-*-otp` routes' error strings still said "Enter the 8-digit
  code" after the 6-digit Zod-validation fix (the item this section
  used to list as deferred) -- the schemas were fixed, the hardcoded
  message text next to them wasn't.
