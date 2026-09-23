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
};

export default nextConfig;
