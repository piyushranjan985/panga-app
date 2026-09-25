# findmyVybe Admin Portal

Operations + Trust & Safety + Support + Privacy/DPDP Compliance +
Analytics, in one console, for the team running findmyVybe. A separate
Next.js 16 app in the same repository (`admin/`), with its own
`package.json`, deployed as its own Vercel project -- but sharing the
consumer app's Postgres database and its one `prisma/schema.prisma`
(one directory up). See `prisma.config.ts` in this folder for exactly how.

Full route-by-route API reference: `docs/API.md`.
DPDP Act 2023 / DPDP Rules 2025 mapping: `docs/DPDP_COMPLIANCE.md`.

## Why a separate app, not a `/admin` folder in the consumer app

Two different trust boundaries and two different login systems (separate
admin email+password+MFA vs. the consumer app's phone/email OTP), and a
mistake in admin code should never be able to take the consumer app down.
Sharing the schema instead of duplicating it means there is nothing to
keep in sync by hand -- add a field to `User` once, both apps' generated
Prisma clients see it after their own `prisma generate`.

## Local setup

```bash
cd admin
cp .env.example .env       # fill in DATABASE_URL (same Neon/Postgres instance as the consumer app)
npm install                # runs `prisma generate` via postinstall
npm run seed                # creates your Super Admin account + demo data -- see below
npm run dev                  # http://localhost:4000
```

Sign in at `/login` with the email printed by the seed script (your own
email, seeded as `SUPER_ADMIN`) and the temporary password it prints.
You'll be walked through MFA enrollment (an authenticator app QR code) on
first login -- there's no way to sign in without MFA once it's enabled.

### Database migrations

This app has no schema of its own to migrate -- `prisma/schema.prisma`
lives in the root app, and so does the migration history
(`prisma/migrations`). Run `npm run db:migrate` (or your usual Prisma
migration command) from the **repo root**, not from `admin/`. This app
only ever needs `npx prisma generate` (already wired into `postinstall`)
to get a typed client for the tables that migration created.

### Seeding (`npm run seed`)

`scripts/seed-admin.ts` is idempotent -- safe to re-run. It:

- Creates (or leaves alone, if it already exists) your own account,
  `piyushranjan985@gmail.com`, as `SUPER_ADMIN`. Set `ADMIN_SEED_PASSWORD`
  in your `.env` to control the temporary password; otherwise one is
  generated and printed once, here only -- there's no email delivery in
  this build, so this is the only place it surfaces.
- Creates eight demo accounts, one per non-Super-Admin role
  (`demo.moderator@findmyvybe.internal`, etc.), each with its own random
  printed password, so you can sign in as each role to sanity-check what
  the permission matrix actually restricts.
- Seeds sample Moderation cases, Support tickets, Consent records, Privacy
  requests, one Privacy incident, Data processors, Retention policies,
  Processing activities, Feature flags, Notification templates, and one
  acknowledged Ops alert -- attached to real users from the consumer
  app's own seed data (run that one first, or this script logs a warning
  and skips the sample content that needs real users).
- Deliberately does **not** seed a completed DPDP deletion request --
  that would permanently anonymize a real seeded user's account. Run that
  flow live from the Privacy Centre against a throwaway test account
  instead, once you want to see it end to end.

### Tests (`npm run test`)

`tsx --test tests/**/*.test.ts` -- Node's built-in test runner, no new
framework dependency. Covers `lib/rbac.ts`'s role/permission invariants,
`lib/mask.ts`'s PII masking, `lib/password.ts`'s hashing, and
`lib/configApproval.ts`'s config-key routing -- all pure functions, no
database connection required, so these run the same in CI as locally.

## Deploying to Vercel

This is a **second, separate Vercel project** pointed at the same GitHub
repo as the consumer app, not a second deployment of the existing one:

1. In Vercel, "Add New... Project", import the same repository again.
2. **Root Directory**: set it to `admin`.
3. Under that project's Root Directory setting, enable **"Include source
   files outside of the Root Directory in the Build Step"**. This is not
   optional -- `prisma.config.ts` reads `../prisma/schema.prisma`, one
   directory above `admin/`, and the build fails without this toggle on.
4. Framework preset: Next.js (auto-detected). Build command
   (`npm run build`, which is really `next build`) and install command
   (`npm install`, which runs `prisma generate` via `postinstall`) are
   both already correct as the `package.json` defaults -- no override
   needed.
5. Set the environment variables below on this project. `DATABASE_URL`
   should point at the **same** Postgres instance as the consumer app's
   Vercel project -- that's the whole point of sharing the schema.
6. Deploy. The admin portal gets its own Vercel URL/domain, separate from
   the consumer app's -- put it behind your own DNS name (e.g.
   `admin.findmyvybe.app`) rather than leaving it on the default
   `*.vercel.app` subdomain, and consider Vercel's password/SSO
   protection or an IP allowlist on top of this app's own login+MFA, since
   this console can read PII and take enforcement action across your
   whole user base.

After the first deploy, run `npm run seed` once against production
`DATABASE_URL` (from your machine, with that env var set, or via
`vercel env pull` + local run) to create your real Super Admin account.

## Environment variables

See `.env.example` for the full list with inline explanations. Summary:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Same Postgres instance as the consumer app. |
| `ADMIN_SESSION_JWT_SECRET` | Signs the session cookie that carries only a `sessionId` (the real session state -- including `stepUpAt` -- lives in the `AdminSession` table, unlike the consumer app's fully stateless JWT). Generate with `openssl rand -base64 32`. |
| `ADMIN_SESSION_COOKIE_NAME` | Defaults to `panga_admin_session`. |
| `ADMIN_STEP_UP_TTL_MINUTES` | How long a password+MFA re-check stays valid before the highest-risk actions (ban, delete account, approve a config change, manage admins, ...) demand it again. Defaults to 15. |
| `ADMIN_MFA_ISSUER` | Issuer name shown in an admin's authenticator app. |
| `NEXT_PUBLIC_ADMIN_APP_NAME` | Cosmetic -- shown in the UI chrome. |
| `ADMIN_SEED_PASSWORD` | Optional -- sets the Super Admin's temporary password at seed time instead of a random generated one. Only read by `scripts/seed-admin.ts`, never by the running app. |

## What's deliberately not built yet

Documented in-app rather than silently missing, so nobody mistakes an
absence for a bug:

- **Payments** (`/payments`) -- no `Subscription`/`Payment` model exists;
  findmyVybe doesn't charge users yet. The page says so.
- **Feature flags / maintenance mode are not read by the consumer app** --
  this portal manages `FeatureFlag` rows through a propose-then-approve
  workflow, but nothing in the consumer app's request path checks them
  yet. Wiring an actual runtime check (e.g. a maintenance-mode gate) is
  follow-up work in that app, not this one.
- **No automatic breach-detection or purge jobs** -- `RetentionPolicy.autoDeleteEnabled`
  and the Notifications page's "live signals" are both intentionally
  manual-trigger/on-demand; there is no background job runner in this
  Next.js app for either to hook into yet.
- **No Consent Manager integration** -- consent is logged directly by the
  consumer app today, not brokered through a DPDP-style Consent Manager.
  See `docs/DPDP_COMPLIANCE.md` §2 for when that might become necessary.
