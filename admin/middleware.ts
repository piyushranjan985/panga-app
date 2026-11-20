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
  // Same reasoning as the main app's proxy.ts: Vercel Cron's own caller
  // (app/api/cron/retention-purge, scheduled by admin/vercel.json) never
  // carries an admin session cookie, so gating it here only ever blocked
  // the legitimate scheduler -- never anyone the route's own CRON_SECRET
  // bearer-token check (that route's real authorization) wouldn't already
  // reject. Without this, the DPDP-deletion retention-purge job silently
  // never ran: every invocation 401'd right here, before the route body
  // -- and its CRON_SECRET check -- ever executed.
  const isCron = pathname.startsWith('/api/cron/');

  if (isPublic || isAuthApi || isAsset || isCron) return NextResponse.next();

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
