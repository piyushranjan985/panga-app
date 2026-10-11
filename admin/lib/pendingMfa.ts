import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { isRealProductionDeployment } from '@/lib/env';

// Short-lived, single-purpose cookie that bridges "password verified" to
// "MFA verified" without creating a real AdminSession until both steps
// pass. Separate secret-use from the main session token so this narrow
// 5-minute credential can never be replayed as a full session cookie.
const COOKIE_NAME = 'panga_admin_pending_mfa';
// See admin/lib/session.ts's identical guard for why this fails closed
// in production instead of silently signing the pending-MFA bridge
// cookie with a secret that's public in this repo's source.
if (!process.env.ADMIN_SESSION_JWT_SECRET && isRealProductionDeployment()) {
  throw new Error(
    'ADMIN_SESSION_JWT_SECRET is not set in production -- refusing to start with the public dev-only fallback secret. Set ADMIN_SESSION_JWT_SECRET in Vercel (Production) to a real random value, e.g. `openssl rand -base64 32`.',
  );
}

const SECRET = new TextEncoder().encode(
  process.env.ADMIN_SESSION_JWT_SECRET || 'dev-only-change-me-please-generate-a-real-secret',
);
const TTL_SECONDS = 5 * 60;

export async function setPendingMfaCookie(adminId: string) {
  const token = await new SignJWT({ adminId, purpose: 'pending_mfa' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(SECRET);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: TTL_SECONDS,
  });
}

export async function readPendingMfaAdminId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (payload.purpose !== 'pending_mfa' || typeof payload.adminId !== 'string') return null;
    return payload.adminId;
  } catch {
    return null;
  }
}

export async function clearPendingMfaCookie() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, '', { path: '/', maxAge: 0 });
}
