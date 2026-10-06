import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { COOKIE_NAME, signSessionToken, IDLE_TIMEOUT_SECONDS } from '@/lib/sessionToken';
import { issueTrustedDevice } from '@/lib/trustedDevice';

/**
 * "Sign out of all other devices" -- the self-service counterpart to the
 * admin portal's "Force logout" action (see admin/lib/userActions.ts),
 * both built on the same User.sessionsInvalidatedAt mechanism (see
 * lib/session.ts's getSession). Every session JWT issued before this
 * moment stops verifying on its next request, on every device --
 * including, if we weren't careful, THIS one, since re-signing a fresh
 * cookie for the current device happens a few milliseconds after the
 * timestamp is written. sessionsInvalidatedAt is deliberately backdated
 * by one second (not "now") so the brand-new token issued a few lines
 * below -- whose `iat` is always whole seconds, never fractional -- can
 * never land on the wrong side of that boundary from a sub-second race
 * (see lib/session.ts's `verified.iat * 1000 < sessionsInvalidatedAt`
 * comparison).
 *
 * Also clears every TrustedDevice row for this user (the silent-reauth
 * cookie, see lib/trustedDevice.ts) -- otherwise another device that was
 * merely idle, not actually logged out, would just silently sign itself
 * back in next time it's opened via /api/auth/device-login, defeating
 * the whole point of this button. The current device gets a fresh
 * session + trusted-device cookie of its own right back below, same as
 * any normal sign-in -- only OTHER devices should need to sign in again.
 */
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  await db.$transaction([
    db.user.update({
      where: { id: session.userId },
      data: { sessionsInvalidatedAt: new Date(Date.now() - 1000) },
    }),
    db.trustedDevice.deleteMany({ where: { userId: session.userId } }),
  ]);

  const token = await signSessionToken({ userId: session.userId });
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: IDLE_TIMEOUT_SECONDS,
  });
  await issueTrustedDevice(session.userId);

  return NextResponse.json({ ok: true });
}
