import type { MetadataRoute } from 'next';

/**
 * Two independent reasons to keep crawlers out, both courtesy-only (not
 * a security control -- a determined visitor can still just open the
 * URL; see lib/auth/betaAllowlist.ts and lib/otp.ts for what actually
 * gates sign-in):
 *  - Still in closed beta (BETA_ALLOWLIST_OPEN isn't "true" yet) -- no
 *    reason for the site to show up in search results before it's
 *    actually open for sign-ups.
 *  - Not the production environment (NEXT_PUBLIC_APP_ENV !== "production",
 *    e.g. dev.findmyvybe.com) -- a dev/staging environment should never
 *    get indexed regardless of the beta-open state, since it isn't the
 *    URL real users should ever land on from search.
 */
export default function robots(): MetadataRoute.Robots {
  const isProduction = process.env.NEXT_PUBLIC_APP_ENV === 'production';
  const betaOpen = process.env.BETA_ALLOWLIST_OPEN === 'true';
  const open = isProduction && betaOpen;
  return {
    rules: {
      userAgent: '*',
      allow: open ? '/' : undefined,
      disallow: open ? undefined : '/',
    },
  };
}
