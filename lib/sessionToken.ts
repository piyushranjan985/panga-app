import { SignJWT, jwtVerify } from 'jose';

/**
 * The pure, edge-safe half of session handling: the JWT itself and the
 * shared constants around it, with no dependency on next/headers or the
 * database. Split out from lib/session.ts specifically so
 * middleware.ts can import it alone -- middleware verifies and slides
 * the session cookie on every request, and pulling in lib/db.ts's
 * Prisma/pg client there would drag Node-only APIs into a file that
 * needs to run in the Edge runtime.
 */

export const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'findmyvybe_session';

export const SECRET = new TextEncoder().encode(
  process.env.SESSION_JWT_SECRET || 'dev-only-change-me-please-generate-a-real-secret',
);

// Absolute ceiling on the JWT itself -- a session can never be extended
// past this just by sliding the cookie below. It's a backstop, not the
// thing that actually enforces "logged out after inactivity" day to
// day; see IDLE_TIMEOUT_SECONDS for that.
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

// The session cookie's own Max-Age. middleware.ts re-sets this on every
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
