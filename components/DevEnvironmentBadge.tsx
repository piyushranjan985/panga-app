// Server component (no 'use client' needed) -- NEXT_PUBLIC_ vars are
// inlined at build time either way, so this reads exactly the same on
// server and client render passes.
//
// The one unmistakable visual difference between environments: without
// this, dev.findmyvybe.com and findmyvybe.com render pixel-identical
// pages, which is exactly how someone ends up testing against (or
// showing a family member) the wrong one. Renders nothing at all when
// NEXT_PUBLIC_APP_ENV="production" (or unset, so a build that forgot to
// set it fails safe by showing the badge rather than silently hiding
// it) -- see .env.example for where this gets set per environment.
export default function DevEnvironmentBadge() {
  const env = process.env.NEXT_PUBLIC_APP_ENV;
  if (env === 'production') return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed left-2 top-2 z-50 rounded-full bg-marigold px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-ink shadow-md"
    >
      {env ? env : 'env unset'}
    </div>
  );
}
