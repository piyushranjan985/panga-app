import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

// Short-lived, single-purpose cookie that bridges "password verified" to
// "MFA verified" without creating a real AdminSession until both steps
// pass. Separate secret-use from the main session token so this narrow
// 5-minute credential can never be replayed as a full session cookie.
const COOKIE_NAME = 'panga_admin_pending_mfa';
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
