/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone', // small, self-contained Docker images — see Dockerfile
  serverExternalPackages: ['@prisma/client', '@prisma/adapter-pg', 'pg'],
  experimental: {
    // Server actions are used for the onboarding + chat forms.
    serverActions: { bodySizeLimit: '2mb' },
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
