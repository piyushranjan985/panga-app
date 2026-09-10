/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone', // small, self-contained Docker images — see Dockerfile
  experimental: {
    // Server actions are used for the onboarding + chat forms.
    serverActions: { bodySizeLimit: '2mb' },
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
