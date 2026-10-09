/**
 * Next.js's instrumentation hook -- loads the right Sentry config for
 * whichever runtime this server process actually is (NEXT_RUNTIME is set
 * by Next itself, not something this codebase configures), and exports
 * onRequestError so Sentry sees server-side errors Next's own error
 * boundaries would otherwise swallow silently from Sentry's point of
 * view (React still renders its own error UI either way -- this just
 * also reports it).
 */
import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
