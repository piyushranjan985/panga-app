import { isRealProductionDeployment } from '@/lib/env';

// Server component (no 'use client' needed) -- NEXT_PUBLIC_ vars are
// inlined at build time either way, so this reads exactly the same on
// server and client render passes.
//
// The one unmistakable visual difference between environments: without
// this, dev.findmyvybe.com and findmyvybe.com render pixel-identical
// pages, which is exactly how someone ends up testing against (or
// showing a family member) the wrong one.
//
// The real gate is isRealProductionDeployment() (VERCEL_ENV, set
// automatically by Vercel on every deploy -- see lib/env.ts), not the
// NEXT_PUBLIC_APP_ENV label below. That used to be the only check here,
// which meant the badge rendered "env unset" on the live
// findmyvybe.com site itself the moment someone forgot to set
// NEXT_PUBLIC_APP_ENV=production in Vercel's Production environment
// variables -- a labeling gap, not an environment problem, but it
// showed up on the real production page regardless. VERCEL_ENV can't
// be forgotten the same way (Vercel sets it on every build), so a real
// production deployment now never shows the badge even if the label
// was never configured. Off Vercel entirely (self-hosted, local
// `next build && next start`), VERCEL_ENV is unset, so the badge still
// shows there -- correct, since "env unset" is exactly true in that
// case too.
export default function DevEnvironmentBadge() {
  if (isRealProductionDeployment()) return null;

  const env = process.env.NEXT_PUBLIC_APP_ENV;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed left-2 top-2 z-50 rounded-full bg-marigold px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-ink shadow-md"
    >
      {env ? env : 'env unset'}
    </div>
  );
}
