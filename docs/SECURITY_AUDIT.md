# Security Audit — findmyVybe (panga-app)

**Date:** 2026-10-11
**Scope:** both Next.js apps in this repo (consumer app at root, admin portal in `admin/`), their shared Prisma/Neon database, and every third-party service they integrate with. Pre-launch, so this is a pre-production hardening pass, not a response to an incident.

**Method:** three focused reviews run in parallel — (1) auth/session/RBAC/rate-limiting, (2) injection risks/input validation/file-upload/SSRF, (3) secrets hygiene/HTTP headers/CORS/webhook auth — each grepping the real codebase end to end and citing file:line for every claim, followed by my own verification and fixes for everything confirmed exploitable. Nothing below is speculative "best practice" padding; every gap was confirmed against this specific codebase, and most of what's listed as "already correct" was equally specific (not just "looks fine").

**Overall read:** this codebase came into the audit unusually mature for pre-launch — OTP handling, admin RBAC/step-up, IDOR guards, security headers, and secrets hygiene were already built with a real adversarial mindset (see docs/OTP_SECURITY.md, the `assertParticipant`/`requirePermission` patterns). The audit found one critical gap (now fixed), one high-severity gap (now fixed), and a short list of smaller items, most already acceptable as-is or deliberately deferred with a documented reason — not a laundry list of problems.

---

## 1. Fixed this pass

### 1.1 [CRITICAL] Hardcoded fallback JWT signing secret, no production guard — FIXED

**Where:** `lib/sessionToken.ts`, `lib/auth/oauthState.ts`, `lib/safety/identityVerification.ts`, `admin/lib/session.ts`, `admin/lib/pendingMfa.ts`.

All five session/state-token secrets fell back to the literal string `'dev-only-change-me-please-generate-a-real-secret'` whenever `SESSION_JWT_SECRET` (consumer app) or `ADMIN_SESSION_JWT_SECRET` (admin) was unset — with no check anywhere refusing to run that way in production. The consumer-app JWT payload is literally `{ userId }`, so if `SESSION_JWT_SECRET` were ever missing from a real Vercel deployment, anyone who knows (or finds, since it's public in this very file) that fallback string could forge a valid session for **any user, no OTP required** — full account takeover, at scale, silently. The admin equivalent is narrower (the JWT only carries a `sessionId`, which is still checked against a real, revocable `AdminSession` DB row), but a forged JWT pointing at a currently-valid admin session would still be accepted.

**Fix:** each of the five files now throws at import time if its secret env var is unset **and** `isRealProductionDeployment()` (a new `VERCEL_ENV === 'production'` check, mirroring the pattern `lib/otp.ts` already used for its own "a real env var was never set before shipping" guard). Local dev and Vercel Previews are unaffected — only a genuine production boot with the secret missing now fails loudly (the app won't start / the request 500s) instead of silently accepting the public fallback string as a real secret. Added `admin/lib/env.ts` (the admin app didn't have an equivalent to the root app's `lib/env.ts`) to host the same check for admin's two files.

**Action required before your next deploy:** confirm `SESSION_JWT_SECRET` and `ADMIN_SESSION_JWT_SECRET` are actually set in Vercel's **Production** environment variables (both are present in your local `.env`/`admin/.env`, which is a good sign they were set up correctly, but I can't see Vercel's dashboard to confirm). If either is missing in Production, this fix will make that deployment fail to boot instead of silently running insecurely — which is the correct trade-off, but you should know about it *before* pushing, not be surprised by a failed deploy.

### 1.2 [HIGH] SSRF via unvalidated `photoUrls` fetched server-side during moderation — FIXED

**Where:** `app/api/profile/route.ts` (onboarding's `photoUrls` field), `lib/safety/moderateAndUpload.ts`'s `moderateImageUrl`.

Onboarding's `PUT /api/profile` accepted `photoUrls` as any non-empty strings (no URL-format or hostname check), stored them directly as `Photo.url`, and the async moderation worker later called `fetch(photo.url)` on each one. A user could submit a URL pointing at an internal service, a cloud metadata endpoint (`169.254.169.254`), or an oversized response body instead of a real Vercel Blob URL — causing the server to make an authenticated-context request to wherever the attacker chose, with no response-size limit either.

**Fix:** added `isTrustedPhotoBlobUrl()` to `lib/upload.ts`, checking the URL is `https://` and matches this project's own Vercel Blob hostname pattern (the same pattern already trusted by the CSP's `img-src`). Wired into the `photoUrls` Zod schema (rejected at validation time, before ever being stored) **and** re-checked inside `moderateImageUrl` itself as defense in depth, so the function stays safe even if called from somewhere else later without the caller having validated first. Also added a hard size cap to `moderateImageUrl`'s fetch (streamed, not trusting `Content-Length`) matching the same 4MB ceiling the direct-upload path already enforces, closing the secondary DoS angle.

### 1.3 Dependency vulnerabilities — partially fixed

Ran `npm audit` on both apps. Applied `npm audit fix` (non-force, semver-compatible only) to both:
- **Root app:** `source-map-js` DoS patched. Typecheck + full test suite (37/37) still pass.
- **Admin app:** `next` bumped 16.3.6 → 16.4.0, fixing six HIGH-severity Next.js advisories including an **Image Optimization SSRF** and **cache-poisoning/cross-user content substitution** bug — this one mattered, since the admin portal was running an older, more-vulnerable Next.js patch than the root app already was (root was already on the fixed 16.3.8). `sharp` bumped 0.35.4 → 0.35.5 (librsvg CVE). Typecheck + full test suite (25/25) still pass. (A full `npm run build` verification hit an unrelated file-permission error specific to this session's connection to your computer — not a code issue — so typecheck + tests are the verification signal here; worth running `npm run build` yourself once before deploying, as you'd do for any dependency bump.)

See §4 for what's left unfixed and why.

---

## 2. Flagged, not changed (your call, not urgent)

These are real but lower-severity, or involve a tradeoff I didn't think was mine to make unilaterally. Each has a concrete fix path if you want it done.

1. **[Medium] No IP-based rate limiting on admin login** (`admin/app/api/auth/login/route.ts`) — lockout is per-admin-email only (5 attempts/15 min), so an attacker can spray-guess across many admin emails from one IP with no throttle. Low practical risk (bcrypt cost 12, 12-char minimum, mandatory MFA still sits behind it), but inconsistent with the IP-tiered limiting already built for consumer OTP (`lib/otpRateLimit.ts`) — that same pattern could be reused here in under an hour of work.
2. **[Medium] File-type validation is client-reported MIME/extension only at upload time; the real decode-time check happens after the file is already live at a public URL.** A non-image file could sit briefly (until the async moderation worker runs) at a public, UUID-named Blob URL under whatever content-type the client declared. Low real risk (no executable content-type gets served as HTML by Vercel Blob, and SVG — the usual XSS vector here — isn't in the accepted-type allowlist), but tightening to a quick magic-byte sniff before storing would close the window entirely.
3. **[Medium] CSP allows `'unsafe-inline'` for scripts and styles**, in both apps — a deliberate, documented v1 tradeoff in the code's own comments, pending a nonce-based rollout. This is the single largest "if XSS ever happens anyway" exposure, since `unsafe-inline` would let an injected `<script>` actually execute. Worth scheduling as real follow-up work, not an oversight to panic about today (no XSS path was found in this audit — see §3).
4. **[Low] No attempt cap on admin MFA/TOTP verify** (`admin/app/api/auth/mfa/verify/route.ts`) — attempts are audited but not rate-limited. Needs a valid password first (the `pendingMfa` cookie gate), and TOTP's 30s rotation makes brute force impractical anyway; still a defense-in-depth gap worth closing alongside item 1.
5. **[Low] No rate limiting on `app/api/discover/search`, `app/api/help/ask`, or `app/api/upload`** (onboarding upload) — all three are plausible next additions to the rate-limiting discipline already applied to OTP/swipe/messages, not deliberate omissions. `help/ask` matters most if `ANTHROPIC_API_KEY` is ever set (unbounded external API cost); `upload` matters for Blob storage cost (no cleanup job exists for orphaned pre-onboarding blobs either).
6. **[Low/Info] QStash callbacks are authenticated by the same shared `CRON_SECRET` bearer token, not QStash's own cryptographic request-signature verification** (`@upstash/qstash`'s `Receiver`). Reasonable as-is (one unguessable, unlogged secret, checked on every callback) but skips a defense-in-depth layer that'd let you detect a tampered/replayed QStash payload independent of the secret.
7. **[Info] Email HTML in the photo-moderation notification is built via raw string interpolation of the user's own `displayName`**, unescaped (`app/api/cron/moderate-photo/route.ts`). Only reachable by a user attacking their own inbox via their own display name — not a cross-user vector — but trivial to wrap in a proper escape if you want it airtight.
8. **[Info] `CRON_SECRET` and OTP-hash comparisons use `===`, not a constant-time comparison.** Theoretical timing side-channel only; not practically exploitable over real network jitter. Noted for completeness, not worth code churn.

---

## 3. Confirmed correct — not re-flagging these

Listed so you know they were actually checked, not assumed:

- **OTP design** (`lib/otp.ts`, `lib/otpRateLimit.ts`): cryptographically random 6-digit codes, hashed at rest, 5-min expiry, single-use, max-10-attempts hard lockout, tiered per-destination/per-IP/global rate limits, production fail-closed guard against mock codes leaking live, deliberately vague error messages (no probing signal).
- **Session cookies**: `httpOnly` + `secure` (prod) + `sameSite: 'lax'` on both apps; consumer sessions check `User.sessionsInvalidatedAt` on every request (real server-side revocation, not just cookie-clearing); admin sessions are fully DB-backed with real revocation and a server-enforced step-up-auth gate on every sensitive route (not UI-only).
- **Admin password hashing**: bcrypt, cost 12, 12-char minimum, generic error on failure (no account enumeration). Mandatory TOTP MFA on first login, bcrypt-hashed single-use recovery codes.
- **IDOR protection**: centralized and consistently applied — `assertParticipant()` gates every match/message/report/block route; photo/profile lookups go through the caller's own session, never a trusted client-supplied ID.
- **Raw SQL**: every `$executeRaw`/`$queryRaw` call site uses Prisma's parameterized tagged templates; the one `$queryRawUnsafe` (admin trends) only ever interpolates from a fixed, Zod-validated enum map — no injection path anywhere in the codebase.
- **Input validation**: Zod schemas on every route that accepts a body (54 files); no `dangerouslySetInnerHTML` anywhere — React's default escaping covers all user content (bio, chat, display names). No stored-XSS path found.
- **File storage**: server-generated UUID filenames (no path traversal), Vercel Blob (not local disk — correct for serverless).
- **Secrets hygiene**: `.gitignore` correctly covers every `.env` variant in both apps; `git log --all` across full history confirms no secret file was ever committed, even transiently; no hardcoded fallback secrets anywhere else in the codebase (`DUPLICATE_CHECK_PEPPER` specifically fails closed — throws rather than using a weak default — if unset).
- **HTTP security headers**: HSTS (2yr, includeSubDomains, preload), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, a locked-down `Permissions-Policy`, and a CSP with `frame-ancestors 'none'`, `object-src 'none'`, `form-action 'self'` — applied globally on both apps, with admin's additionally stricter (`X-Robots-Tag: noindex, nofollow`, narrower allowed origins).
- **CORS**: no route sends permissive CORS headers; default same-origin everywhere (no public third-party API surface exists that would need an exception).
- **Cron/webhook auth**: every cron route fails closed (500, not "run open") if `CRON_SECRET` itself isn't configured server-side.
- **Third-party credential handling**: every provider key/token loaded from env, never committed; Firebase/FCM service account loaded as a JSON env var string, not a checked-in file; provider error logging never leaks the credential itself.

---

## 4. Remaining dependency vulnerabilities (deliberately not force-fixed)

After the non-breaking `npm audit fix` pass in §1.3, both apps still show vulnerabilities whose only available fix is a **breaking** downgrade or major version bump:

- **`deepmerge-ts`/`mysql2` (via `prisma`'s own dependency tree, both apps, HIGH):** the only fix path (`npm audit fix --force`) would **downgrade Prisma to 6.19.3** — a major step backward from the Prisma 7 this app runs on, and migrations/schema features were built against 7. Real-world exploitability here is close to zero: `mysql2`'s CVEs are about a MySQL wire-protocol downgrade attack and a decompression bomb, and this app only ever talks to Postgres (Neon) — `mysql2` is dead weight in Prisma's multi-engine dependency tree, never actually invoked. Not worth a Prisma downgrade to silence.
- **`sprintf-js`/`argparse` (via `@tensorflow/tfjs` → `nsfwjs`, root app, MODERATE):** the only fix (`--force`) would downgrade `@tensorflow/tfjs` to 2.1.0, which is very likely to break the self-hosted photo-moderation pipeline (nsfwjs/face-api) — safety-critical infrastructure that shouldn't be downgraded blind. The underlying CVE (unbounded `sprintf` precision specifier → DoS) is only reachable if attacker-controlled input ever reaches a `sprintf` format string inside TF.js's internals, which nothing in this app's own code does.
- **A handful of moderate/high findings in `@capacitor/cli`'s dev-only dependency tree** (`xcode`/`uuid`, both apps) — build tooling for the mobile app wrapper, never runs in a deployed server context, lowest priority of everything here.

Recommendation: revisit these at a natural Prisma/TF.js major-version upgrade window, not as a standalone forced bump today. I did **not** force-fix any of these — consistent with how we've handled every other "blanket fix vs. careful batches" decision in this engagement.

---

## 5. Platform/infrastructure — outside this codebase, your action needed

I can't see your actual dashboard settings on any of these (no API/CLI access was configured for them in this session), so these are concrete checklists, not things I verified are already correct. Treat this as the "what a real pentest would ask you to screenshot" list.

### Vercel
- **Environment variables**: confirm `SESSION_JWT_SECRET`, `ADMIN_SESSION_JWT_SECRET`, `DUPLICATE_CHECK_PEPPER`, `CRON_SECRET`, and every third-party API key are set for **Production** (not just Preview/Development), and that each was generated with real entropy (`openssl rand -base64 32`), not left as a placeholder. This is the single most important item on this whole list given §1.1's fix.
- **Deployment Protection**: turn on Vercel's Deployment Protection (password or Vercel-auth-gated) for Preview deployments at minimum — a preview URL is often guessable/discoverable and would otherwise run with real env vars pointed at a shared Neon branch.
- **Admin app specifically**: it's a staff tool with PII/ban powers reachable at a public URL purely by whoever knows it exists — seriously consider Vercel's IP Allowlisting (Pro/Enterprise) or putting it behind Vercel Authentication, so the login screen itself isn't internet-facing to begin with. The codebase comments already flag this as "needs to happen outside the codebase" — this is that action.
- **Domains**: confirm your production domain enforces HTTPS-only (Vercel does this by default, but worth a manual check), and that any staging/preview subdomain isn't indexed (robots.txt / noindex — admin already sends `X-Robots-Tag`, check the consumer app too if you don't want preview URLs in search results).
- **Team access**: audit who has access to the Vercel project/org — anyone with write access can read every production env var from the dashboard. Enable 2FA on every account with access, remove anyone who shouldn't have it.
- **Function logs**: Vercel logs request bodies/headers by default in some configurations — spot-check that OTP codes, session tokens, or API keys never end up in a log line (grep your Vercel log export, or just read through a few real request logs).

### Neon (Postgres)
- **Role permissions**: the app's `DATABASE_URL` user (`neondb_owner` per your `.env`) looks like Neon's default owner role, which has full DDL rights. Consider creating a narrower-scoped role for the app's runtime connection (SELECT/INSERT/UPDATE/DELETE only, no `DROP`/`ALTER`) and reserving the owner role for migrations only (run from your machine or CI, not from the deployed app). This limits blast radius if the connection string ever leaks.
- **IP allowlisting**: Neon supports restricting which IPs can connect. Since Vercel serverless functions don't have stable IPs, this mostly isn't practical for the app's own connection, but it's worth restricting for any direct `psql`/Prisma Studio access from your own machine.
- **Connection pooling**: confirm you're using Neon's pooled connection string (the `-pooler` hostname, which your `.env` already shows) for the app, not the direct connection — this is a reliability/cost issue more than security, but worth confirming it's consistent everywhere `DATABASE_URL` is set.
- **Backups / point-in-time recovery**: confirm your Neon plan includes PITR and you know the retention window — this is your actual disaster-recovery story if an admin account is ever compromised and used to mass-delete data (the retention-purge audit logging we built helps detect this; PITR is what lets you undo it).
- **Branch protection**: if you use Neon's branching for previews, make sure preview branches aren't seeded with real production PII — confirm your preview/dev seed data is synthetic, not a production branch/copy.

### GitHub (source repo)
- **Branch protection on `main`**: require PR review before merge (even solo, this stops a direct force-push accident), require status checks (typecheck/test/lint) to pass before merge.
- **Secret scanning + push protection**: enable GitHub's secret scanning and push protection (free for public repos, included in GitHub Advanced Security for private repos on paid plans) — an extra backstop on top of `.gitignore` already being correct.
- **Dependabot**: enable Dependabot security updates so the `npm audit` findings in §4 get automatic PRs when a non-breaking fix becomes available, and alerts for anything new.
- **2FA**: confirm 2FA is required on your GitHub account (and any collaborator's) — this is the account that can push code that runs in production.
- **Sentry's GitHub App**: you just connected this (per our earlier conversation) — confirm it's scoped to only this repo, not your whole account, which you already did correctly when we walked through it.

### Upstash QStash / Redis (if used for rate limiting)
- Rotate `QSTASH_TOKEN` if it's ever been shared outside this session. Confirm the QStash dashboard shows only expected destination URLs (your own `/api/cron/*` routes) — if you ever see an unfamiliar scheduled message, that's a sign the token leaked.

### Brevo (transactional email)
- Scope the API key to transactional-email-sending only if Brevo's dashboard supports granular API key permissions (most providers do) — don't use a full-account key if a send-only one is available.
- Confirm SPF/DKIM/DMARC are set up for your sending domain in Brevo's domain settings — not a security issue for your app directly, but affects whether your OTP/notification emails land in inboxes vs. spam, which has safety implications (a user who never sees their verification email is stuck).

### Firebase/FCM (push notifications)
- In the Firebase Console, confirm the committed client API keys (`android/app/google-services.json`, `ios/App/App/GoogleService-Info.plist` — these are meant to be public/committed, that's normal) have **API key restrictions** set: Android package name + SHA-1, iOS bundle ID. An unrestricted Firebase API key can be abused for quota/billing abuse by anyone who extracts it from your app binary, even though it can't read your database.
- Confirm the FCM service account JSON (server-side, the one in `FIREBASE_SERVICE_ACCOUNT_JSON`) has the minimum IAM role needed (Firebase Cloud Messaging only), not a broader project-editor role.

### Domain / DNS / Sentry
- **Domain registrar**: 2FA on your registrar account, and consider a registrar lock to prevent unauthorized transfer.
- **DNSSEC**: enable if your registrar/DNS host supports it — prevents DNS spoofing attacks against your domain.
- **Sentry**: the org token we just generated is powerful (org-wide). Store it only in Vercel's env vars (already done) and never commit or paste it anywhere public — if it's ever exposed, regenerate it from Sentry's Org Tokens settings immediately.

---

## 6. Suggested cadence

This was a point-in-time audit. Realistic ongoing hygiene for a pre-launch app at your stage:
- Re-run `npm audit` monthly (or let Dependabot do it continuously once enabled).
- Revisit §2's deferred items before or shortly after public launch — several (admin login IP rate limit, MFA attempt cap) are cheap and worth doing once this sprint's higher-priority work is clear.
- Treat §5's platform checklist as a one-time setup pass to do this week — none of it depends on code changes, all of it is dashboard clicks.
