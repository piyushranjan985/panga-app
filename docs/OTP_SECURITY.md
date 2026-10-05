# OTP Security & Abuse Protection — Design Spec

Status: **Decided — built 2026-10-10** (scope locked via in-chat
clarifying questions after the user supplied a detailed production-OTP
spec: build both the UI redesign and backend hardening in one pass; keep
the existing "welcome back" messaging over strict anti-enumeration; skip
CAPTCHA for now)
Owner: Product / Platform
Related: `lib/otp.ts`, `lib/otpRateLimit.ts`, `lib/rateLimitClientId.ts`,
`components/OtpCodeInput.tsx`, `app/api/cron/otp-cleanup/route.ts`,
`tests/otpRateLimit.test.ts`, `prisma/schema.prisma` (`OtpCode`,
`OtpPurpose`, `OtpChannel`), `docs/PHONE_FIRST_AUTH.md` (the trusted-
device/passkey/Apple work this builds on top of, from the previous pass)

## 0. What this is, in one paragraph

A hardening pass over the existing phone/email OTP system, prompted by a
detailed external spec the user supplied after finding the sign-in page
"didn't look like how I thought." Most of that spec's requirements
turned out to already exist from the previous session's work (hashed,
single-use, expiring, attempt-capped codes; a swappable SMS provider;
phone/email verification tracked independently; trusted devices +
passkeys + Google/Apple cutting real SMS volume after initial
verification). The genuinely new work here is: real per-destination/IP/
global rate limits with progressive cooldowns and a soft suspicious-
number throttle; a purpose/channel-tracked `OtpCode` schema; an
`OTP_ENABLED` emergency kill switch; an automatic cleanup job; a fixed
6-digit/8-character length inconsistency that had been flagged and
deliberately deferred in the previous pass; a pure-logic test suite; and
a redesigned sign-in/verify UI matching the spec's Gen-Z mockup
(segmented code boxes, friendlier copy, an edit-number link, OS
autofill).

## 1. The one deliberate deviation from the supplied spec: "welcome back" messaging

The spec's §3 asks that an unauthenticated OTP request never reveal
whether a phone/email already has an account ("if this number can
receive a code, one was sent"), to prevent account enumeration. This app
does the opposite on purpose: `/api/auth/request-otp` and
`/api/auth/request-email-otp` both tell the client whether an account
already existed (`alreadyHasProfile`), and `/verify` shows a "Welcome
back" banner before the code is even entered, so nobody mistakenly
thinks they're creating a second profile. Asked directly about this
tradeoff, the user chose to keep the existing messaging — the UX
clarity is worth more than the enumeration resistance at this stage (a
dating app's phone/email-by-phone enumeration risk is modest, and the
confusion of "wait, did this just make a new account?" is a real,
observed support cost). This is the one place this implementation
intentionally does NOT match the supplied spec; everything else does.

## 2. Rate limiting — four layers, checked cheapest-and-most-specific first

`lib/otpRateLimit.ts` holds every decision as a pure, DB-free function
(`evaluateOtpRequestCounts`, `computeProgressiveCooldownSeconds`,
`isSuspiciousPhoneNumber`) — `lib/otp.ts`'s `issueOtp` is what gathers
the real counts from `OtpCode` and calls them. Checked in this order,
so a normal person hitting a normal limit gets a specific, true reason
rather than a generic "the whole system is busy" message that's
actually about someone else's abuse:

1. **Cooldown** — how long since the last request to this exact
   destination. Progressive: `computeProgressiveCooldownSeconds` doubles
   the base cooldown (`OTP_RESEND_COOLDOWN_SECONDS`, default 60s) for
   each request already made to that destination within a lookback
   window (`OTP_PROGRESSIVE_COOLDOWN_LOOKBACK_HOURS`, default 3h),
   capped at `OTP_PROGRESSIVE_COOLDOWN_MAX_SECONDS` (default 30 min).
2. **Suspicious-number soft throttle** — `isSuspiciousPhoneNumber`
   deliberately flags only a short list of obviously-fake patterns
   (all-same-digit, and the canonical `1234567890`/`9876543210`-style
   test runs), not a general "any sequential run" rule — a broader rule
   would also flag this repo's own placeholder example number
   (`+919876543210`, used in `app/login/page.tsx`'s input placeholder
   and `.env.example`) and any real number that just happens to be
   locally sequential. A flagged number gets
   `OTP_SUSPICIOUS_NUMBER_DAILY_LIMIT` (default 1) substituted in place
   of the normal daily cap — never a hard block, so an unlucky
   coincidence still gets one code through.
3. **Per-destination hour/day caps** — `OTP_MAX_REQUESTS_PER_PHONE_PER_HOUR`/
   `_DAY` and the `_EMAIL_` equivalents.
4. **Per-IP hour/day caps** (`OTP_MAX_REQUESTS_PER_IP_PER_HOUR`/`_DAY`) —
   catches one source hammering many different destinations, which the
   per-destination caps above can't see by themselves. Only enforced
   when an IP was actually available (`x-forwarded-for`/`x-real-ip`);
   never treats "unknown IP" as "zero requests."
5. **Global hour cap** (`OTP_MAX_REQUESTS_GLOBAL_PER_HOUR`) — optional,
   unset by default (no global cap at all). A platform-wide safety
   valve for a genuine runaway-cost event, not something to set casually
   — sized too low, it takes down sign-in for everyone the moment it's
   hit.

Every rejection reason collapses, for the CLIENT-facing message, to just
"try again in a bit" vs "try again tomorrow" (`describeIssueOtpFailure`
in `lib/otp.ts`) — IP/global/suspicious are never named specifically, so
a prober learns nothing about which layer actually caught them. The
full `detail` (which exact layer tripped) is only ever logged
server-side (`[otp-abuse]` lines), never returned to the client.

**"Per device/session where practical"** (the original ask's own
hedge) is handled honestly rather than over-built: a long-lived,
anonymous, httpOnly cookie (`findmyvybe_rlid`,
`lib/rateLimitClientId.ts`) tags every request from the same browser and
is recorded on the `OtpCode` row for monitoring (e.g. "did this one
browser profile touch 30 different numbers today"), but nothing
currently rate-limits on it directly — it's trivially cleared or absent
from a non-browser client, so it's one more weak signal alongside the
IP and per-destination limits that actually hold the line, not a
security boundary of its own.

## 3. `OTP_ENABLED` — a blunter instrument than `MOCK_MODE_PHONE`/`MOCK_MODE_EMAIL`

The previous pass already had `MOCK_MODE_PHONE`/`MOCK_MODE_EMAIL`
(force a channel onto the fixed mock code even with a real provider
configured) and `isMockOtpUnsafeInProduction` (refuse mock entirely on
real production traffic with no real provider set). Neither of those
is "stop everything right now." `OTP_ENABLED="false"` is: it refuses
every OTP issuance on both channels, real or mock, the instant it's
set, no deploy needed — the lever for an active-abuse incident or a
cost spike that needs an immediate, total stop while someone
investigates.

## 4. Schema — `OtpPurpose`, `OtpChannel`, and abuse-rate metadata on `OtpCode`

`prisma/migrations/20261010080000_otp_security_hardening`. Two new
enums (`OtpPurpose`: `SIGNUP`/`LOGIN`/`PHONE_CHANGE`/`EMAIL_CHANGE`;
`OtpChannel`: `PHONE`/`EMAIL`) and five new nullable columns on
`OtpCode`: `destination`, `channel`, `purpose`, `requestIp`, `clientId`.

All nullable, all best-effort, on purpose: rows written before this
migration have none of this, and that's fine — they're ephemeral,
already-expired data the new cleanup cron (§7) purges on its own
schedule regardless. `destination` is denormalized (the phone/email
this code actually went to, not derived by joining through `User`,
whose phone/email can itself change later) specifically so every rate-
limit query in `lib/otp.ts` stays single-table. Rate-limiting now keys
on `destination`+`channel` rather than `userId` — correct for both the
sign-in routes (one user per verified phone/email anyway) and the
authenticated "add phone/email" routes, where the thing actually worth
limiting is "how many codes went to this number," regardless of which
account is asking.

`purpose` is set at request time from information the route already
has: `SIGNUP` vs `LOGIN` on `/api/auth/request-otp` is decided by
whether a `User` row already existed for that phone before this
request; `/api/auth/request-email-otp` is always `LOGIN` (it never
creates an account — see `docs/PHONE_FIRST_AUTH.md`); the two
`/api/profile/*/request-otp` routes are `PHONE_CHANGE`/`EMAIL_CHANGE`.
Nothing currently branches rate limits by purpose, but it's recorded
for exactly that reason it might be worth doing later (e.g. a tighter
cap on brand-new signups than on returning logins) without another
migration.

## 5. Fixing the 6-digit / 8-character mismatch

The previous pass's auth redesign had already flagged, and deliberately
deferred, a pre-existing inconsistency: `lib/otp.ts` generates real
6-digit codes, but `MOCK_OTP` was 8 characters (`43364336`) and every
verify route's Zod schema validated `.length(8)` to match it. This pass
fixes it outright — `MOCK_OTP` is now `433643` (6 digits), every
`.length(8)` became `.length(6)`, and the new `OtpCodeInput` component
(§9) is built around a 6-character code everywhere it's used. There was
no reason left to defer this once the UI redesign meant touching every
one of those input fields anyway.

## 6. Provider-spend estimate logging

Neither StartMessaging, MSG91, nor Brevo exposes a spend/usage API this
app calls, so "monitoring of provider spending/usage where available"
is implemented as a rough glance, not real billing: every 50th real SMS
send, `lib/otp.ts` logs an estimated day's cost
(`channelDailyVolume * OTP_SMS_COST_INR_ESTIMATE`, default ₹0.25/SMS) to
Vercel's logs. This is explicitly NOT a dashboard or a real cost
figure — it's a `console.log` someone skimming logs can use to notice
"huh, that number's climbing faster than expected" well before a real
invoice would say the same thing. Email gets an analogous note against
Brevo's 300/day free-tier ceiling instead of a cost figure.

## 7. Cleanup cron

`app/api/cron/otp-cleanup` (same `CRON_SECRET` bearer-auth pattern as
the existing `mystery-match` cron), scheduled daily at 21:15 UTC
(~2:45am IST) in `vercel.json` — an hour distinct from the two existing
crons. Deletes `OtpCode` rows that expired more than 24 hours ago,
rather than the instant they expire, so a brief look at "what just
happened" (debugging a user's failed sign-in, or reading the
`[otp-abuse]`/`[otp-cost]` log lines against what's still in the table)
has a short window to work with.

## 8. Testing — pure logic only, matching this repo's existing convention

`tests/otpRateLimit.test.ts`, run with `npm test`
(`tsx --test tests/**/*.test.ts`) — the same `node:test` + plain
`assert` pattern `admin/tests/*.test.ts` already uses, added to the root
app's `package.json` for the first time (root had no test script before
this). Deliberately covers ONLY `lib/otpRateLimit.ts`'s pure functions
(`computeProgressiveCooldownSeconds`, `isSuspiciousPhoneNumber`,
`evaluateOtpRequestCounts`, `getOtpRateLimitConfig`,
`clientIpFromRequest`) — none of which touch Prisma or
`next/headers`. `lib/otp.ts` itself (the DB-touching orchestration) is
deliberately NOT unit-tested here, for the same reason `admin/tests/`
has never tested anything that imports its `lib/db.ts`: this repo has no
mocked-database test harness, and standing one up was out of scope for
this pass. A real end-to-end test (hitting the actual routes against a
disposable test database with a mock OTP provider) is the natural next
step if this project adds integration testing generally — see §10.

`lib/rateLimitClientId.ts` exists as its own file specifically so that
`lib/otpRateLimit.ts` never needs to import `next/headers` — the one
piece of this feature that genuinely needs request-scoped cookie access
lives there instead, keeping every pure decision function trivially
testable outside a Next.js runtime.

## 9. UI — segmented-looking code input, friendlier copy, edit-number link

`components/OtpCodeInput.tsx`: visually six boxes, but underneath
exactly ONE real `<input>` (`autoComplete="one-time-code"`,
`inputMode="numeric"`, `maxLength={6}`), rendered invisible
(`opacity: 0`, not `display: none`, so it stays focusable/paste-able/
autofillable) with six plain `div`s beneath it showing whatever `value`
currently holds, one character each, plus a blinking CSS caret in the
active cell. This is deliberate: splitting an OTP field into six
separate DOM inputs — the naive way to get "boxes" — is exactly the
implementation that breaks iOS/Android SMS autofill and the
`autoComplete="one-time-code"` heuristic, since the OS fills ONE text
field with the whole code, not six single-digit ones one at a time.
With one real field, paste, manual typing, and OS autofill all work
automatically with zero special-case code. An optional `onComplete`
callback (receiving the just-completed value directly, not read back
off component state) lets a verify screen auto-submit the instant
someone finishes typing/pasting/autofilling, without a separate "done"
tap — wired up on `/verify`, `/verify-phone`, and both code-entry steps
in `components/AccountSecuritySection.tsx`.

`app/login/page.tsx`'s phone-method copy changed to "What's your
number? / We'll send you a quick verification code." (email method
keeps its own, since email is sign-in-only now, not signup — see
`docs/PHONE_FIRST_AUTH.md`). The login page also now reads
`?method=&phone=&email=` query params on mount to prefill the form —
purely so `/verify`'s new "Edit number"/"Edit email" link
(`router.push('/login?method=phone&phone=...')`) can return someone to
a pre-filled form instead of an empty one. `/verify`'s heading became
"Enter your code," with the destination displayed grouped
(`+91 98765 43210` via a small display-only formatter, never stored or
sent that way) and the resend cooldown's default bumped from 30s to 60s
to match `OTP_RESEND_COOLDOWN_SECONDS`'s new default (the client-side
countdown is just a display; the server enforces its own, possibly
longer/progressive, cooldown independently either way). Error text on
both screens now sits in an `aria-live="polite"` region with
`role="alert"`, and every text input carries an explicit `aria-label`.

## 10. What's explicitly deferred, not forgotten

- **CAPTCHA/bot protection** — asked about directly; declined for now
  (no real traffic yet to justify the added friction for every user,
  not just abusers). Cloudflare Turnstile was the proposed option if
  this becomes necessary later.
- **Strict anti-enumeration** — see §1; a deliberate, discussed decision
  to keep the current "welcome back" messaging instead.
- **True end-to-end/integration tests** against a real or mocked
  database and HTTP layer — this repo has no test-database harness at
  all yet (not for this feature, not for anything else); §8's pure-
  logic suite is the same scope `admin/tests/` already uses elsewhere.
- **A native WebOTP API integration** (`navigator.credentials.get({otp})`)
  for instant SMS retrieval without relying on the browser's
  `autoComplete="one-time-code"` autofill heuristic — the heuristic
  alone already covers iOS/Android well; the explicit API would need the
  SMS body itself to contain an app-hash-tagged string, a provider-
  template change out of scope here.
- **Real provider spend/usage API integration** — §6's logging is a
  rough glance precisely because none of StartMessaging/MSG91/Brevo
  exposes a spend API this app calls; wiring one in is provider-specific
  work for whichever provider ends up carrying real production volume.
- **Rate-limiting on the `findmyvybe_rlid` client-id cookie directly** —
  recorded for monitoring only today (§2); turning it into an actual
  limit is possible later without a schema change.

## 11. Decision trail (chat, 2026-10-10)

- The user supplied a detailed, external 15-section OTP spec after
  finding the sign-in page "didn't look like how I thought." Research
  showed most of the spec was already satisfied by the previous pass's
  work; presented the real gaps back as three clarifying questions
  (scope/priority, the enumeration-messaging tradeoff, CAPTCHA) rather
  than guessing at a 15-section rebuild.
- Answered: build both the UI redesign and the backend hardening in one
  pass (not split across sessions); keep the existing "welcome back"
  messaging over strict anti-enumeration; skip CAPTCHA for now.
