import { SignJWT, jwtVerify } from 'jose';
import { cookies, headers } from 'next/headers';
import { db } from '@/lib/db';

// MVP auth: a signed, httpOnly JWT cookie set after OTP verification.
// This is intentionally minimal so it's easy to read end-to-end. Before a
// real launch, swap in a managed auth provider (Clerk / Supabase Auth) or at
// least add refresh-token rotation and device/session revocation — see the
// "Trust & Safety" section of the strategy doc.

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'findmyvybe_session';
const SECRET = new TextEncoder().encode(
  process.env.SESSION_JWT_SECRET || 'dev-only-change-me-please-generate-a-real-secret',
);
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

// Deliberately just the user id: a session no longer implies "signed in with
// phone" now that email, Google, and Facebook are all valid ways in. Anything
// that needs the user's phone/email looks it up fresh from the DB.
export interface SessionPayload {
  userId: string;
}

// `method` distinguishes phone OTP / email OTP / Google / Facebook -- the
// four call sites (app/api/auth/verify-otp, verify-email-otp,
// mock-google, mock-facebook) each pass their own. This also writes a
// LoginEvent row (admin portal's "Login/session history" on the User
// detail page, and the Dashboard's platform breakdown) -- best-effort:
// a logging failure never blocks the actual login.
export async function createSession(
  payload: SessionPayload,
  meta: { method: 'phone_otp' | 'email_otp' | 'google' | 'facebook' },
) {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(SECRET);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });

  try {
    const h = await headers();
    const userAgent = h.get('user-agent') || undefined;
    const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || undefined;
    // No dedicated native-platform header exists yet (capacitor.config.ts
    // loads the site as a remote URL with no custom UA) -- this heuristic
    // is good enough for a rough web/iOS/Android split on the dashboard.
    // Swap for a real signal (e.g. a header Capacitor sets) if precision
    // ever matters more than "roughly right".
    const ua = (userAgent || '').toLowerCase();
    const platform = /iphone|ipad|ipod/.test(ua) ? 'ios' : /android/.test(ua) ? 'android' : 'web';

    await db.loginEvent.create({
      data: { userId: payload.userId, method: meta.method, platform, ip, userAgent },
    });
  } catch {
    // best-effort only
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (typeof payload.userId !== 'string' || typeof payload.iat !== 'number') return null;

    // "Force logout" (admin User Action, see admin's users/[userId]/actions
    // route) sets User.sessionsInvalidatedAt -- any cookie issued before
    // that moment is rejected here even though the JWT itself still
    // verifies fine. One extra indexed lookup per request; acceptable at
    // this scale (every route already does several Prisma calls), and a
    // clean place to add caching later if it ever isn't.
    const user = await db.user.findUnique({
      where: { id: payload.userId },
      select: { sessionsInvalidatedAt: true },
    });
    if (!user) return null;
    if (user.sessionsInvalidatedAt && payload.iat * 1000 < user.sessionsInvalidatedAt.getTime()) {
      return null;
    }

    return { userId: payload.userId };
  } catch {
    return null;
  }
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (typeof payload.userId !== 'string') return null;
    return { userId: payload.userId };
  } catch {
    return null;
  }
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, '', { path: '/', maxAge: 0 });
}

export { COOKIE_NAME };
