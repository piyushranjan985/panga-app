import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME, IDLE_TIMEOUT_SECONDS, verifySessionToken } from '@/lib/sessionToken';

/**
 * Slides the session cookie's expiry forward on every request that
 * carries a still-valid one, so "logged out after 10 minutes of
 * inactivity" is enforced by the cookie itself, not just by client-side
 * JS. Deliberately reads lib/sessionToken.ts (not lib/session.ts,
 * which pulls in the database) -- this needs to stay dependency-light
 * enough to run on every request, including in the Edge runtime.
 *
 * This alone doesn't cover a page that's open but genuinely idle while
 * something keeps polling in the background (app/matches/[matchId]'s 4s
 * message poll would refresh this cookie forever) -- that's what
 * components/InactivityLogout.tsx is for, tracking real interaction and
 * explicitly logging out. The two are complementary: this catches
 * "nothing reached the server at all for 10 minutes" (tab/app closed,
 * device asleep, network gone), that one catches "requests kept
 * happening, but nobody's actually there".
 *
 * /api/auth/* is excluded below because those routes manage the cookie
 * themselves (creating it on login, deleting it on logout) -- no need
 * for this to also touch it there, and it avoids any risk of two
 * Set-Cookie writes for the same cookie landing in one response.
 */
export async function middleware(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.next();

  const verified = await verifySessionToken(token);
  if (!verified) return NextResponse.next();

  const res = NextResponse.next();
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: IDLE_TIMEOUT_SECONDS,
  });
  return res;
}

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|manifest.webmanifest|models).*)'],
};
