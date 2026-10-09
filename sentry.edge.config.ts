/**
 * Sentry init for the Edge runtime (proxy.ts / any edge route). See
 * instrumentation-client.ts for the full setup note.
 */
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  debug: false,
});
