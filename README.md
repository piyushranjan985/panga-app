# VybeMatch — MVP starter

A working starter codebase for **VybeMatch**, a vibe-first dating & matrimony-lite
platform for Indian Gen Z. This is the coded companion to the original strategy
document and the [interactive product demo] — it implements the same core
mechanics for real: transparent intent tags, circle-based discovery, the
Vibe Reveal blur mechanic, a trust/verification layer, and No-Ghost closes.

**Stack:** Next.js 14 (App Router, TypeScript) · Tailwind CSS · Prisma ORM ·
PostgreSQL · a hand-rolled phone-OTP session (JWT, httpOnly cookie) · Docker.

> **Honesty note:** this codebase was authored in a sandboxed environment
> with no access to the npm or PyPI registries, so `npm install` / `npm run
> build` could not be executed or verified here. Every file was hand-written
> against the exact APIs of the pinned dependency versions in
> `package.json`, and the one piece of business logic that doesn't need any
> dependency — the discovery/matching algorithm in `lib/matching.ts` — **was**
> installed-and-run-verified in-sandbox with `npm run verify:matching` (uses
> the globally available `tsx`, no install required; 8/8 checks pass). Run
> `npm install` on your own machine as the first step below — that's normal
> for any new project, but flagging it here since it wasn't optional this
> time.

## Quick start (Docker — recommended)

```bash
cp .env.example .env
docker compose up --build
# in a second terminal, once the web container is healthy:
docker compose exec web npx prisma migrate deploy
docker compose exec web npm run db:seed
```

Visit `http://localhost:3000`. Log in with any demo number
(`+919810000001` … `+919810000005`) and OTP **123456** — five seeded demo
profiles across Bengaluru, Pune and Delhi NCR let you see a populated
Discover feed immediately.

## Quick start (local Node, no Docker)

```bash
npm install
cp .env.example .env
# point DATABASE_URL at a local Postgres or a free Neon/Supabase project
npx prisma migrate dev --name init
npm run db:seed
npm run dev
```

## Project layout

```
app/                  Next.js App Router — pages + API routes
  page.tsx              Landing page
  login/, verify/        Phone OTP sign-in
  onboarding/            4-step profile setup (basics, intent, interests, circles)
  discover/               Swipe/reveal feed
  matches/, matches/[id]  Match list + chat thread
  profile/                Intent, Quiet Mode, family preview, verification
  api/                    Route handlers (auth, profile, circles, discover, swipe, matches, messages, verification)
lib/
  matching.ts            Core scoring algorithm — framework-free, unit-tested
  session.ts             JWT session cookie helpers
  db.ts                  Prisma client singleton
  constants.ts            Seed data shared by the DB seed script and onboarding UI
components/             VibeCard, IntentBadge, Navbar
prisma/schema.prisma    Full data model
prisma/seed.ts          Demo circles, interests, prompts, and 5 demo users
scripts/verify-matching.ts  Standalone test for lib/matching.ts (no DB, no framework)
```

## How the product mechanics map to code

| Mechanic (see demo) | Where it lives |
| --- | --- |
| Intent Tags (Just Vibing / Something Real / Rishta Ready) | `IntentType` enum in `prisma/schema.prisma`; scored in `lib/matching.ts`; edited in `app/profile` |
| Circles-based discovery | `Circle` / `CircleMember` models; picked in onboarding step 4; scored in `lib/matching.ts` |
| Vibe Reveal (blur until you answer prompts) | `PromptAnswer` model; rendered client-side in `components/VibeCard.tsx` |
| Trust layer (ID + liveness badge, family preview) | `verification` + `familyPreviewOn` on `Profile`; `app/api/verification` (mocked KYC call) |
| No-Ghost close | `app/api/matches/[matchId]/messages` — `noGhostClose: true` sends a soft close and ends the match |
| Quiet Mode | `quietMode` boolean on `Profile`; filtered out in `lib/matching.ts#isEligibleCandidate` |

## What's deliberately mocked for the MVP

- **OTP delivery** — always `123456` in dev (`OTP_PROVIDER=mock`). Wire up
  MSG91 / Gupshup / Twilio Verify before real users touch this.
- **ID verification** — `POST /api/verification` flips straight to VERIFIED
  after a timeout. Wire up a KYC vendor (Hyperverge / IDfy / Signzy) webhook
  before launch.
- **Photos** — profiles use generated gradient avatars, not uploaded
  photos, so the starter needs no object storage to run. Adding real photo
  upload is a Day-2 task: add an `S3`/Cloudflare R2 presigned-upload route
  and a `photoUrl` field on `Profile`.
- **Chat delivery** — the chat screen polls every 4s. Fine for an MVP,
  replace with a WebSocket/Pusher/Ably channel before it needs to feel
  instant at scale.

These shortcuts (and the order to remove them in) are covered in more detail
in the strategy document's roadmap.

## Testing

```bash
npm run verify:matching   # matching algorithm — no DB required
npm run typecheck         # tsc --noEmit
npm run lint               # next lint
```

## Environment variables

See `.env.example`. At minimum you need `DATABASE_URL` and
`SESSION_JWT_SECRET` (generate with `openssl rand -base64 32`) to run
locally.

[interactive product demo]: ../vybematch/demo.html
