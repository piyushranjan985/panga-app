'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

// Keep in sync with lib/sessionToken.ts's IDLE_TIMEOUT_SECONDS -- can't
// import a server/edge module's constant into this client component
// directly, so this is the one place it's repeated. (A mismatch here
// only changes how snappy the client-side redirect feels; the server
// side -- proxy.ts sliding the cookie, and app/api routes' own
// getSession() checks -- is what actually enforces it either way.)
const TIMEOUT_MS = 10 * 60 * 1000;

// Real user interaction only -- deliberately not "any network request",
// since app/matches/[matchId]/page.tsx polls the server every 4s for
// new messages regardless of whether anyone's looking at the screen.
// visibilitychange is included so backgrounding the tab/app (mobile:
// switching away) starts the clock, and coming back to it resets it
// like any other interaction.
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'] as const;

/**
 * Mount once on every screen that requires a session (see each page's
 * own import -- app/discover, app/matches, app/matches/[matchId],
 * app/profile, app/onboarding, app/help). Renders nothing; after
 * TIMEOUT_MS with no real interaction it calls the real logout endpoint
 * (clearing the session cookie server-side, the same as clicking
 * "Log out") and sends the person back to /login with a reason so the
 * page can explain why they landed there instead of just looking broken.
 */
export default function InactivityLogout() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function loggedOutDueToInactivity() {
      fetch('/api/auth/logout', { method: 'POST' }).finally(() => {
        router.push('/login?error=inactive_logout');
      });
    }

    function reset() {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(loggedOutDueToInactivity, TIMEOUT_MS);
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') reset();
    }

    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, reset, { passive: true }));
    document.addEventListener('visibilitychange', onVisibilityChange);
    reset();

    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, reset));
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [router]);

  return null;
}
