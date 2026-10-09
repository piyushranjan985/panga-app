/**
 * Sentry client-side init (browser). Ships before it's configured,
 * upgrades the moment it is -- same "safe no-op until an env var is set"
 * stance as lib/queue/qstash.ts and lib/notifications/email.ts elsewhere
 * in this codebase: `Sentry.init` with an empty/undefined `dsn` just
 * doesn't send anything, so this file is harmless to ship even before
 * PKR has created a Sentry account.
 *
 * SETUP (the one part that can't happen from this codebase): create a
 * free account at sentry.io (the Developer plan -- no card required),
 * create a Next.js project, and copy its DSN. Set
 * NEXT_PUBLIC_SENTRY_DSN in Vercel (Production + Preview) to that value
 * and redeploy. Must be NEXT_PUBLIC_-prefixed to reach the browser
 * bundle, same reasoning as every other client-visible env var in this
 * codebase (see lib/auth/googleOAuth.ts's NEXT_PUBLIC_APP_URL).
 *
 * tracesSampleRate/replaysSessionSampleRate are deliberately conservative
 * (10%/0%) rather than Sentry's own 100%/10% example defaults -- this is
 * a pre-launch app with unknown traffic, and sampling can be turned up
 * once there's a sense of real volume and the free-tier event budget it
 * costs (see Sentry's pricing page: the Developer plan's event quota is
 * shared across errors, traces, and replays).
 */
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  debug: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
