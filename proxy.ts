import { NextResponse, type NextRequest } from 'next/server';
import { verifySessionToken, COOKIE_NAME, IDLE_TIMEOUT_SECONDS } from '@/lib/sessionToken';

// Route protection at the edge, before any page or API handler runs.
// Kept as an explicit allowlist of PUBLIC paths (rather than a blocklist of
// protected ones) so a newly-added private route is safe-by-default.
//
// Also includes public app/preview/[userId] (the no-sign-in "Family
// Preview" shareable link) as a prefix, and /privacy + /robots.txt --
// both need to be reachable by someone with no session at all (a
// visitor Google/Meta's review checks the privacy policy as, or a
// search crawler).
const PUBLIC_PATHS = ['/', '/login', '/verify', '/privacy', '/robots.txt', '/manifest.webmanifest', '/hero-triptych.jpg'];
const PUBLIC_PREFIXES = ['/_next', '/icons', '/api/auth', '/preview', '/api/preview'];

// Imported from lib/sessionToken.ts (not lib/session.ts) deliberately --
// that file pulls in next/headers and the database, neither of which
// this needs, and this runs on every request.
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    if (pathname.startsWith('/api')) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Slide the session cookie's expiry forward on every request that
  // still verifies -- this is what actually enforces "logged out after
  // 10 minutes of inactivity" (IDLE_TIMEOUT_SECONDS) at the server:
  // stop making requests entirely (tab/app closed, device asleep,
  // network gone) for that long and the cookie itself just expires
  // client-side. It can't catch a page that's open but genuinely idle
  // while something keeps polling in the background (see
  // app/matches/[matchId]'s 4s message poll) -- that's what
  // components/InactivityLogout.tsx is for, tracking real interaction
  // and explicitly logging out client-side.
  const res = NextResponse.next();
  res.cookies.set(COOKIE_NAME, token as string, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: IDLE_TIMEOUT_SECONDS,
  });
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
