import type { MetadataRoute } from 'next';

/**
 * While the app is gated behind lib/auth/betaAllowlist.ts (i.e.
 * BETA_ALLOWLIST_OPEN isn't "true" yet), tell well-behaved crawlers to
 * stay out entirely -- there's no reason for findmyvybe.com to show up
 * in search results before it's actually open for sign-ups. This is a
 * courtesy to polite bots only, not a security control (a determined
 * visitor can still just open the URL) -- the real access control is the
 * allowlist itself.
 */
export default function robots(): MetadataRoute.Robots {
  const open = process.env.BETA_ALLOWLIST_OPEN === 'true';
  return {
    rules: {
      userAgent: '*',
      allow: open ? '/' : undefined,
      disallow: open ? undefined : '/',
    },
  };
}
