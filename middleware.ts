import { NextResponse, type NextRequest } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/session';

// Route protection at the edge, before any page or API handler runs.
// Kept as an explicit allowlist of PUBLIC paths (rather than a blocklist of
// protected ones) so a newly-added private route is safe-by-default.
const PUBLIC_PATHS = ['/', '/login', '/verify', '/manifest.webmanifest'];
const PUBLIC_PREFIXES = ['/_next', '/icons', '/api/auth'];

export async function middleware(req: NextRequest) {
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

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
