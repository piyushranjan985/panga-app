/**
 * Sentry server-side init (Node runtime). See instrumentation-client.ts
 * for the full setup note -- same DSN-gated, safe-no-op-until-configured
 * approach. Uses SENTRY_DSN (not NEXT_PUBLIC_-prefixed) since this file
 * never runs in the browser; it's fine to default to the public DSN too
 * since Sentry DSNs aren't secret (they're meant to be embedded in
 * client bundles), but keeping server/client as separate env vars
 * matches Sentry's own convention and lets Vercel's env var UI show
 * which is which.
 */
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  debug: false,
});
