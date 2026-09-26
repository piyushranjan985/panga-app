/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // NOTE: `output: 'standalone'` is for self-hosting via the Dockerfile.
  // Vercel does its own build packaging and the two conflict (it breaks
  // Vercel's file-tracing step) — leave this off while deploying on Vercel.
  // If you later self-host with Docker, add `output: 'standalone'` back.
  serverExternalPackages: ['@prisma/client', '@prisma/adapter-pg', 'pg'],
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
    return [
      {
        // Allow the PWA manifest + service worker to be installed from any route.
        source: '/manifest.webmanifest',
        headers: [{ key: 'Content-Type', value: 'application/manifest+json' }],
      },
    ];
  },
};

export default nextConfig;
