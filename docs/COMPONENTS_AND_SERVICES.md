# Components & Third-Party Services — findmyVybe

A complete inventory of everything the solution touches: every hosted platform, third-party API/service, and account this app depends on or could depend on, plus what's self-hosted (no external account at all). Built for two purposes: onboarding anyone new to the stack, and the account-ownership-transfer project (moving everything from personal accounts to Crosspaths Technologies Pvt Ltd) — this is the master checklist for that.

Status legend: **Live** (configured and in active use), **Code built, credentials unconfirmed** (the integration is fully written, merged, and verified to degrade gracefully if its env var is blank — but I can't see whether the real API key/secret is actually set in Vercel's dashboard, only that it's absent from the local `.env` file; see note under each), **Optional/not set up** (code supports it, confirmed not configured anywhere I can see, feature degrades gracefully instead), **Not yet live** (requires an external approval process, not just an env var).

---

## Hosting & compute

- **Vercel** — three projects on one account/team:
  - `findmyvybe-app` (consumer app, this repo's root) — **Live**, serves `findmyvybe.com` (production, `main` branch) and `dev.findmyvybe.com` (preview, `develop` branch)
  - `findmyvybe-admin` (`admin/`) — **Live**, internal staff portal
  - `findmyvybe-moderation-service` (`moderation-service/`) — **Not deployed**. An optional extraction of the photo-moderation ML step into its own Vercel project (for if the inline self-hosted version ever needs splitting out); `IMAGE_MODERATION_PROVIDER` is currently set to `self-hosted` (inline), not `remote`, so this isn't in use.
  - Also provides: Vercel Cron (built-in, not a separate account) runs 4 scheduled jobs — `date-feedback-nudge`, `mystery-match`, `otp-cleanup` (root app) and `retention-purge` (admin).

## Database

- **Neon** (managed Postgres) — **Live**. One instance, one shared schema, read/written by both the consumer app and the admin portal.

## Caching & queuing

- **Upstash Redis** (via Vercel Marketplace integration) — **Code built, credentials unconfirmed**. Powers the Discover-feed cache (`092d635`); without `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` the app just re-queries Postgres every time, which is still correct, just slower. Confirmed absent from the local `.env` (31 lines, neither var present) — but that file is for local dev; if these were added directly in the Vercel dashboard (Project → Settings → Environment Variables) for Production, the feed is already caching in prod and this file simply never got the local copy. Check the dashboard for those two exact var names to know for sure.
- **Upstash QStash** — **Code built, credentials unconfirmed**. Spreads Mystery Match push delivery over ~an hour instead of firing all at once, and wakes the async photo-moderation worker (`lib/queue/qstash.ts`). Without `QSTASH_TOKEN`, `queueConfigured` is `false` and the code falls back to immediate/inline delivery — confirmed in `app/api/cron/mystery-match/route.ts`. Same caveat as Redis: absent from local `.env`, unconfirmed in Vercel's actual Production environment variables — check the dashboard for `QSTASH_TOKEN` specifically.

## File storage

- **Vercel Blob** — **Live**. Every profile photo.

**Hobby-plan free tier** (per Vercel's own pricing docs, checked October 2026): 1 GB storage/month, first 10,000 Simple Operations/month (cache-miss reads + `head()`), first 2,000 Advanced Operations/month (`put()`/`copy()`/`list()`, store creation — one `put()` per photo upload), first 10 GB Blob Data Transfer/month (every download/view, hit or miss), max 5 TB per file (512 MB cache threshold above which every access is a miss). None of this is billed on Hobby if exceeded — Blob access simply stops working for 30 days. Profiles here cap at 5 photos, up to 4 MB each (`MAX_UPLOAD_BYTES`), no client-side resize/compression currently applied, so real photos likely average 0.5–2 MB depending on the phone.
  - **Storage** is the generous one: at ~1 MB/photo average, 1 GB covers ~1,000 photos (~200 full profiles) before storage itself is the limiter.
  - **Advanced Operations (2,000/month)** cover ~2,000 uploads/month — roughly 400 new/edited full profiles a month, free.
  - **Data Transfer (10 GB/month)** is the real constraint for a swipe-based app: every photo *view* (not just upload) counts, hit or miss. At ~1 MB/photo, 10 GB is only ~10,000 photo views/month — a trivial number once real swiping starts, likely exhausted in days, not months, after any real launch traffic.
  - If this project is still on Vercel's Hobby plan, the practical risk isn't cost, it's a **hard 30-day lockout** once any one of these limits is hit — recommend moving the project to Pro (usage-based billing, no hard cutoff, optional Spend Management caps) before real launch traffic, not after.

## Identity & authentication

- **Google Cloud / Google OAuth** — **Live** (or mock fallback if unconfigured). Powers "Continue with Google."
- **DigiLocker / API Setu** (Government of India, Ministry of Electronics & IT) — **Not yet live**. Government-ID verification; requires findmyVybe's own organization to complete registration + KYC/approval on the API Setu Partners portal (apisetu.gov.in) before `DIGILOCKER_CLIENT_ID`/`SECRET` can even be issued — a real-world approval process, not a dashboard setting. Currently runs in `mock` mode.
- **WebAuthn/Passkeys** — browser-native standard, no third-party account at all.
- Removed/never used: Facebook, Instagram, and Apple Sign-In were all scaffolded at some point and removed — see `docs/PHONE_FIRST_AUTH.md`. Apple Sign-In may need revisiting before an App Store submission (Guideline 4.8).

## Communications (OTP, email, SMS, push)

- **Brevo** — **Live** (or mock fallback). Transactional email: OTP codes, ops alert emails. Free tier, 300/day.
- **StartMessaging** — **Live/configured, not yet live-tested** with a real account. SMS OTP provider, no DLT registration needed, the faster path to real phone sign-in.
- **MSG91** — **Optional/not set up**. Alternate SMS OTP provider; needs its own TRAI DLT registration (real KYC process, 24–48h + a one-time fee once the business entity exists) but is cheaper at high volume.
- **Firebase Cloud Messaging (Google)** — **Not yet set up** (env var not in `.env.example` — flagged separately, see note below). Push notifications across Android, iOS, and web, all through one Firebase project. The only real cost is creating the Firebase/Google account itself.

## Observability

- **Sentry** — **Live** (just set up). Error tracking/APM for both apps, GitHub App connected for source-code context.

## Realtime

- **Ably** — **Code built, credentials unconfirmed**. Realtime chat message delivery (`77f464a` — this was genuinely built together, not skipped); without `ABLY_API_KEY`, `realtimeConfigured` is `false` and chat correctly falls back to its original 4-second poll (`lib/realtime/ably.ts`). Absent from local `.env` — but local dev routinely runs without it. Check the Vercel dashboard for `ABLY_API_KEY` under Production to see whether it's actually live there.

## AI

- **Anthropic API** (Claude) — **Optional/not set up**. Powers natural-language phrasing for VybeHelp (in-app help chat); VybeHelp works without it via deterministic retrieval from `lib/helpCenter.ts`.

## Domain, DNS, email

- **Domain registrar** — `findmyvybe.com` (+ `dev.findmyvybe.com`, `admin.findmyvybe.com` subdomains).
- **Zoho Mail** — `support@findmyvybe.com`, `hello@findmyvybe.com` — set up, per our conversation.

## Source control & CI

- **GitHub** — the repo itself, plus GitHub Actions (`.github/workflows/ci.yml` — typecheck/test/lint on push/PR, no third-party CI service, no external secrets needed). Also where Sentry's GitHub App is connected for source-code context.

## Mobile app shells (built, not yet published)

- **Capacitor** — wraps the live Vercel deployment as a native Android/iOS shell (not a static export — same backend, same session cookies). Two build targets: production (`findmyvybe.com`) and dev (`dev.findmyvybe.com`, separate app ID so both can be installed side by side).
- Not yet needed, but will be once you're ready to publish: a **Google Play Console** developer account (Android) and an **Apple Developer Program** membership (iOS, $99/year) — neither exists yet in this stack.

## Self-hosted — no third-party account at all

- **Photo moderation ML** (`nsfwjs` + `@vladmandic/face-api` on `@tensorflow/tfjs`, pure JS, no native binaries) — runs inline inside the Vercel function, nudity + face-presence checks, zero external API calls or accounts. Model weight files are fetched from a public GitHub-hosted model repo at build time (`scripts/download-face-api-models.mjs`), not a live account relationship.
- **WebAuthn/Passkeys** (see above).

## Local development only (not production infrastructure)

- **Docker / docker-compose** — local Postgres container for `npm run dev`, never used in production (Neon is).
- **Prisma** — the ORM/migration tool talking to Neon; not a hosted service with its own account (aside from an optional Prisma Postgres product this app doesn't use).

---

## Note: one gap found compiling this list

`FIREBASE_SERVICE_ACCOUNT_JSON` (the server-side credential `lib/notifications/push.ts` needs to actually send FCM pushes) isn't documented in `.env.example` the way every other provider is — it's mentioned only in the code's own doc comments. Worth adding to `.env.example` alongside the others when push notifications are actually being wired up, so it doesn't get missed.
