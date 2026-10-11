/**
 * Mirrors the consumer app's lib/env.ts (not shared -- these are two
 * separate Next.js apps/deployments, same reasoning as admin having its
 * own lib/db.ts and lib/session.ts rather than importing the root app's).
 *
 * Whether this process is serving real production traffic, as opposed to
 * a Vercel Preview deployment or a local/dev build -- both of which also
 * have NODE_ENV==='production' once built, so NODE_ENV alone can't tell
 * "the live admin portal" apart from "a PR preview" or "someone's
 * laptop." VERCEL_ENV is set automatically by Vercel to exactly
 * "production" | "preview" | "development", and is unset entirely off
 * Vercel.
 *
 * Used to gate production-only safety nets -- see admin/lib/session.ts
 * and admin/lib/pendingMfa.ts's ADMIN_SESSION_JWT_SECRET guards.
 */
export function isRealProductionDeployment(): boolean {
  return process.env.VERCEL_ENV === 'production';
}
