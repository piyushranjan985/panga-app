import { SignJWT, jwtVerify } from 'jose';
import { isRealProductionDeployment } from '@/lib/env';

/**
 * The pure, edge-safe half of session handling: the JWT itself and the
 * shared constants around it, with no dependency on next/headers or the
 * database. Split out from lib/session.ts specifically so
 * proxy.ts can import it alone -- middleware verifies and slides
 * the session cookie on every request, and pulling in lib/db.ts's
 * Prisma/pg client there would drag Node-only APIs into a file that
 * needs to run in the Edge runtime.
 */

export const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'findmyvybe_session';

// Fail closed in production rather than silently signing/accepting every
// session with a secret that's public in this repo's source -- without
// this, an unset SESSION_JWT_SECRET on a real deployment would let
// anyone forge a session JWT for any userId (the entire payload --
// see getSession() below). Same isRealProductionDeployment() guard
// lib/otp.ts already uses for its own "a real env var was never set
// before shipping" checks; mirrored here and in the two other files
// that reuse SESSION_JWT_SECRET (lib/auth/oauthState.ts,
// lib/safety/identityVerification.ts) and in admin's equivalent pair
// (admin/lib/session.ts, admin/lib/pendingMfa.ts), each against its own
// secret. Edge-safe: isRealProductionDeployment() only reads
// process.env.VERCEL_ENV, no Node-only API, so this still works from
// proxy.ts's Edge middleware.
if (!process.env.SESSION_JWT_SECRET && isRealProductionDeployment()) {
  throw new Error(
    'SESSION_JWT_SECRET is not set in production -- refusing to start with the public dev-only fallback secret, which would let anyone forge a session for any user. Set SESSION_JWT_SECRET in Vercel (Production) to a real random value, e.g. `openssl rand -base64 32`.',
  );
}

export const SECRET = new TextEncoder().encode(
  process.env.SESSION_JWT_SECRET || 'dev-only-change-me-please-generate-a-real-secret',
);

// Absolute ceiling on the JWT itself -- a session can never be extended
// past this just by sliding the cookie below. It's a backstop, not the
// thing that actually enforces "logged out after inactivity" day to
// day; see IDLE_TIMEOUT_SECONDS for that.
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

// The session cookie's own Max-Age. proxy.ts re-sets this on every
// request while the cookie still verifies, so in practice it only ever
// counts down to zero after this many seconds with NO request reaching
// the server at all -- tab/app closed, device asleep, network gone.
// That alone doesn't cover someone who leaves a page open without
// touching it while something keeps polling in the background (see
// app/matches/[matchId]/page.tsx's 4s message poll) -- for that,
// components/InactivityLogout.tsx tracks real user interaction
// client-side and explicitly logs out after the same window.
export const IDLE_TIMEOUT_SECONDS = 60 * 10; // 10 minutes

export interface SessionPayload {
  userId: string;
}

export interface VerifiedSession extends SessionPayload {
  iat: number;
}

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(SECRET);
}

export async function verifySessionToken(token: string): Promise<VerifiedSession | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (typeof payload.userId !== 'string' || typeof payload.iat !== 'number') return null;
    return { userId: payload.userId, iat: payload.iat };
  } catch {
    return null;
  }
}
