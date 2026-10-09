'use client';

/**
 * App Router's top-level error boundary -- catches a render error that
 * escapes every nested route segment (no page-level error.tsx exists yet
 * in this codebase) and reports it to Sentry. Must render its own
 * <html>/<body> (it replaces the root layout entirely when it triggers),
 * and must be a Client Component -- both Next.js requirements, not a
 * choice made here.
 */
import * as Sentry from '@sentry/nextjs';
import NextError from 'next/error';
import { useEffect } from 'react';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        {/* NextError is the default Next.js error page, kept as a
            reasonable fallback UI rather than building a bespoke one --
            this only renders when something has already gone wrong
            badly enough to escape every other error boundary. */}
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
