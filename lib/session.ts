import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

// MVP auth: a signed, httpOnly JWT cookie set after OTP verification.
// This is intentionally minimal so it's easy to read end-to-end. Before a
// real launch, swap in a managed auth provider (Clerk / Supabase Auth) or at
// least add refresh-token rotation and device/session revocation — see the
// "Trust & Safety" section of the strategy doc.

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'vybematch_session';
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

export async function createSession(payload: SessionPayload) {
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
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (typeof payload.userId !== 'string') return null;
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
