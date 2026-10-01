/**
 * Whether this process is serving real production traffic, as opposed to
 * a Vercel Preview deployment or a local/dev build -- both of which also
 * have NODE_ENV==='production' once built (`next build && next start`),
 * so NODE_ENV alone can never tell "the live site" apart from "a PR
 * preview" or "someone's laptop." VERCEL_ENV is set automatically by
 * Vercel to exactly "production" | "preview" | "development", and is
 * unset entirely off Vercel.
 *
 * Used to gate production-only safety nets that would make local
 * development and PR previews unusable if they ran everywhere NODE_ENV
 * happens to say "production" -- see lib/otp.ts's
 * isMockOtpUnsafeInProduction and lib/safety/imageModeration.ts's
 * isUnsafeProductionMock, both of which exist to catch "a real env var
 * was never set before shipping," not to fire during normal dev/QA.
 *
 * Self-hosting via the Dockerfile (see next.config.mjs's
 * output: 'standalone' note) has no Vercel environment at all -- set
 * VERCEL_ENV=production explicitly in that deployment's own env for
 * these guards to apply there too.
 */
export function isRealProductionDeployment(): boolean {
  return process.env.VERCEL_ENV === 'production';
}
