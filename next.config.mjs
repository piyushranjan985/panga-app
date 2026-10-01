/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // NOTE: `output: 'standalone'` is for self-hosting via the Dockerfile.
  // Vercel does its own build packaging and the two conflict (it breaks
  // Vercel's file-tracing step) — leave this off while deploying on Vercel.
  // If you later self-host with Docker, add `output: 'standalone'` back.
  // The Prisma packages were here already (native bindings breaking
  // otherwise). Added for the same underlying reason: these all do
  // their own low-level Node platform detection at import time, and
  // Next's bundler (Turbopack here) rewrites Node built-ins like `util`
  // when it processes a package's source instead of leaving it alone --
  // @tensorflow/tfjs's environment detection calls `new util.TextEncoder()`
  // expecting the REAL Node `util` module, and gets a bundler-provided
  // stand-in without a working TextEncoder constructor instead, throwing
  // "this.util.TextEncoder is not a constructor" the moment
  // lib/safety/imageModeration.ts dynamically imports it (nsfwjs and
  // @vladmandic/face-api both pull in tfjs themselves, so they hit the
  // same problem). Listing a package here tells Next to `require()` it
  // unmodified at runtime instead of bundling its source -- sharp and
  // heic-convert don't strictly need this (sharp especially is usually
  // auto-externalized already, being a native-binary package), but are
  // included for the same class of problem, since both also touch
  // low-level Node internals (native addon loading; WASM instantiation).
  serverExternalPackages: [
    '@prisma/client',
    '@prisma/adapter-pg',
    'pg',
    '@tensorflow/tfjs',
    '@tensorflow/tfjs-backend-wasm',
    'nsfwjs',
    '@vladmandic/face-api',
    'sharp',
    'heic-convert',
  ],
  experimental: {
    // Server actions are used for the onboarding + chat forms.
    serverActions: { bodySizeLimit: '2mb' },
  },
  // Face-api's ssd_mobilenetv1 model weight files (public/models/face-api,
  // fetched by scripts/download-face-api-models.mjs) are read from disk at
  // runtime by lib/safety/imageModeration.ts's self-hosted moderation
  // provider (`faceapi.nets.ssdMobilenetv1.loadFromDisk(...)`). Next's
  // Vercel build traces each serverless function's file dependencies
  // statically to decide what to bundle into it -- and a path read
  // dynamically from inside a third-party package's own internals (not a
  // literal `readFileSync('...')` call visible in our source) is exactly
  // the kind of reference that tracer can miss, silently leaving the model
  // files out of the deployed function even though they exist at build
  // time. That produces an ENOENT that gets caught as a generic provider
  // error and routed to MANUAL_REVIEW (see moderateAndUpload.ts) -- every
  // real photo upload failing "review" the same way, indistinguishable at
  // a glance from an actual borderline-content case. This explicitly forces
  // those files into every API route's bundle so that can't happen again.
  outputFileTracingIncludes: {
    '/api/**/*': ['./public/models/face-api/**/*'],
  },
  // Next 16 moved this out of `experimental.turbo` to a top-level key.
  turbopack: {
    resolveAlias: {
      '.prisma/client/default': './node_modules/.prisma/client/default.js',
    },
  },
  async headers() {
    // SECURITY HEADERS -- applied to every response (source: '/(.*)'),
    // Vercel edge static assets included, since Next's `headers()` is a
    // build-time route-to-header mapping, not per-request middleware
    // logic (keeping it here means it also applies to cached/static
    // responses that never reach proxy.ts's runtime).
    //
    // Strict-Transport-Security is the actual "HTTPS only" instruction:
    // Vercel already terminates TLS and redirects a bare http:// request
    // to https:// for any custom domain, but that first redirect is
    // still one plaintext round trip an attacker on the same network
    // could intercept (SSL-stripping). HSTS tells the BROWSER to never
    // even attempt http:// for this origin again, for the next two years
    // (max-age=63072000), including subdomains (dev.findmyvybe.com,
    // admin.findmyvybe.com) -- closing that gap rather than relying on
    // the redirect alone. `preload` opts into Chrome/Firefox/Safari's
    // built-in HSTS preload list (hstspreload.org) once this has run in
    // production for a while -- submitting there is a manual step (and a
    // slow-to-reverse one: don't submit before HTTPS is confirmed
    // working on every subdomain), not something this header does by
    // itself; the header alone still protects every return visit.
    //
    // Permissions-Policy explicitly allows geolocation (app/discover,
    // app/profile, lib/native.ts's Capacitor bridge all use it -- see
    // app/privacy/page.tsx's Location section) and denies every other
    // sensor/capability this app has no feature that uses (camera,
    // microphone: photo upload goes through a plain file input, not
    // getUserMedia).
    //
    // Content-Security-Policy here is a pragmatic v1, not a maximal one:
    // 'unsafe-inline' stays on script-src/style-src rather than wiring
    // up per-request nonces (a bigger, riskier change to make blind,
    // without being able to click through every page first) -- it still
    // blocks the two things that matter most without it (loading a
    // script from an attacker-controlled THIRD-PARTY origin, and framing
    // this site inside someone else's page). img-src allows Vercel
    // Blob's public photo-storage domain (lib/upload.ts) and Google
    // Fonts' stylesheet/font origins (app/layout.tsx) -- everything else
    // defaults to this origin only. Tighten further (nonce-based
    // script-src, drop 'unsafe-inline') once this has been clicked
    // through end-to-end on a Preview deployment.
    const securityHeaders = [
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      {
        key: 'Permissions-Policy',
        value:
          'geolocation=(self), camera=(), microphone=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), interest-cohort=()',
      },
      {
        key: 'Content-Security-Policy',
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com",
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

    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      {
        // Allow the PWA manifest + service worker to be installed from any route.
        source: '/manifest.webmanifest',
        headers: [{ key: 'Content-Type', value: 'application/manifest+json' }],
      },
    ];
  },
};

export default nextConfig;
