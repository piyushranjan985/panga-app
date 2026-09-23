import { NextResponse, type NextRequest } from 'next/server';

// Coarse, fast gate: no cookie at all -> straight to /login without even
// reaching a page component. This is a UX/perf optimization, not the
// actual security boundary -- Prisma needs the Node.js runtime, so real
// session validation (is it revoked? expired? does the role have
// permission for this route?) happens per-page via lib/pageGuard.ts and
// per-API-route via lib/apiGuard.ts, both of which hit the database. A
// request that clears this middleware can still be turned away there.
const COOKIE_NAME = process.env.ADMIN_SESSION_COOKIE_NAME || 'panga_admin_session';
const PUBLIC_PATHS = ['/login', '/forbidden'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isAuthApi = pathname.startsWith('/api/auth/');
  const isAsset = pathname.startsWith('/_next/') || pathname === '/favicon.ico';

  if (isPublic || isAuthApi || isAsset) return NextResponse.next();

  const hasCookie = req.cookies.has(COOKIE_NAME);
  if (!hasCookie) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
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
