/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['@prisma/client', '@prisma/adapter-pg', 'pg'],
  // This app's Prisma schema lives one directory up (see prisma.config.ts)
  // -- Vercel's file tracing needs to know the real project root so it
  // bundles the schema/migrations that live outside admin/ into the
  // serverless function output.
  outputFileTracingRoot: new URL('..', import.meta.url).pathname,
  turbopack: {
    resolveAlias: {
      '.prisma/client/default': './node_modules/.prisma/client/default.js',
    },
  },
  async headers() {
    // Same rationale as the consumer app's next.config.mjs (read that
    // one first) -- this is the staff-only portal handling PII, so it
    // additionally gets X-Robots-Tag to keep it out of search engines
    // regardless of what robots.txt says (defense in depth, not a
    // substitute for actually restricting who can reach this deployment
    // -- see admin/.env.example / the team's Vercel project settings for
    // IP allowlisting or Vercel's own Deployment Protection, neither of
    // which is something this codebase can configure).
    //
    // img-src needs 'data:' (admin/lib/mfa.ts's QR code is a data: URL,
    // not a file) on top of the same Vercel Blob pattern the consumer
    // app's photo URLs use (flagged-photo review in the moderation case
    // page, users/[userId] page). No Google Fonts link here -- if one
    // gets added later, style-src/font-src need the same two origins the
    // consumer app's CSP allows.
    const securityHeaders = [
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
      {
        key: 'Permissions-Policy',
        value: 'geolocation=(), camera=(), microphone=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), interest-cohort=()',
      },
      {
        key: 'Content-Security-Policy',
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline'",
          "font-src 'self'",
          "img-src 'self' data: https://*.public.blob.vercel-storage.com",
          "connect-src 'self'",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "object-src 'none'",
          'upgrade-insecure-requests',
        ].join('; '),
      },
    ];

    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
