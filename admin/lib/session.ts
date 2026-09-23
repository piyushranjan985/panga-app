import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type { AdminRole } from '@prisma/client';
import { db } from '@/lib/db';

// DB-backed sessions (unlike the consumer app's stateless JWT cookie) --
// the JWT here only carries a sessionId; the AdminSession row is the
// source of truth for whether it's still valid. That's what makes "Force
// logout" and "active sessions" real rather than aspirational: revoking a
// session means setting revokedAt, which this checks on every request.
const COOKIE_NAME = process.env.ADMIN_SESSION_COOKIE_NAME || 'panga_admin_session';
const SECRET = new TextEncoder().encode(
  process.env.ADMIN_SESSION_JWT_SECRET || 'dev-only-change-me-please-generate-a-real-secret',
);
// Shorter than the consumer app's 30-day cookie on purpose: this is a
// staff tool that can ban users and read PII, not a dating app people
// stay signed into for weeks.
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours
const STEP_UP_TTL_MINUTES = Number(process.env.ADMIN_STEP_UP_TTL_MINUTES || '15');

export interface CurrentAdmin {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  mfaEnabled: boolean;
}

interface TokenPayload {
  sessionId: string;
}

export async function createAdminSession(
  adminId: string,
  ip: string | undefined,
  userAgent: string | undefined,
): Promise<string> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const session = await db.adminSession.create({ data: { adminId, ip, userAgent, expiresAt } });

  const token = await new SignJWT({ sessionId: session.id } satisfies TokenPayload)
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

  return session.id;
}

async function readSessionIdFromCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return typeof payload.sessionId === 'string' ? payload.sessionId : null;
  } catch {
    return null;
  }
}

// Returns null for any of: no cookie, bad/expired JWT, revoked session,
// expired session row, or a deactivated AdminUser -- every one of those is
// "not signed in" from the caller's point of view, so middleware and every
// route can treat this as a single boolean gate.
export async function getCurrentAdmin(): Promise<{ admin: CurrentAdmin; sessionId: string; stepUpValid: boolean } | null> {
  const sessionId = await readSessionIdFromCookie();
  if (!sessionId) return null;

  const session = await db.adminSession.findUnique({
    where: { id: sessionId },
    include: { admin: true },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (!session.admin.isActive) return null;

  const stepUpValid = Boolean(
    session.stepUpAt && Date.now() - session.stepUpAt.getTime() < STEP_UP_TTL_MINUTES * 60 * 1000,
  );

  return {
    sessionId: session.id,
    stepUpValid,
    admin: {
      id: session.admin.id,
      email: session.admin.email,
      name: session.admin.name,
      role: session.admin.role,
      mfaEnabled: session.admin.mfaEnabled,
    },
  };
}

export async function recordStepUp(sessionId: string) {
  await db.adminSession.update({ where: { id: sessionId }, data: { stepUpAt: new Date() } });
}

export async function destroyCurrentSession() {
  const sessionId = await readSessionIdFromCookie();
  if (sessionId) {
    await db.adminSession.update({ where: { id: sessionId }, data: { revokedAt: new Date() } }).catch(() => {});
  }
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, '', { path: '/', maxAge: 0 });
}

// Used both for "log out everywhere" (self-service) and when Trust & Safety
// / a Super Admin deactivates another admin's account.
export async function revokeAllSessionsForAdmin(adminId: string) {
  await db.adminSession.updateMany({
    where: { adminId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export { COOKIE_NAME };
