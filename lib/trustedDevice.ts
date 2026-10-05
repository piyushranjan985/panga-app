import crypto from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { db } from '@/lib/db';

/**
 * "Trusted device" -- see docs/PHONE_FIRST_AUTH.md. The actual SMS/email
 * cost lever behind the whole redesign: sessions are short (10-minute
 * idle timeout, see lib/sessionToken.ts), so without this, closing the
 * app for 10+ minutes meant a fresh OTP on every return visit, for
 * everyone. This is a second, much longer-lived, ROTATING token, set in
 * its own cookie alongside (not instead of) the normal session cookie --
 * it only ever grants a fresh SESSION with zero OTP, never bypasses an
 * OTP that a specific action (adding/changing a phone or email) requires
 * on its own terms.
 *
 * Only a sha256 hash is ever stored -- the raw token lives in the
 * viewer's cookie and nowhere else, same pattern as lib/otp.ts's
 * hashOtp/codeHash. A device is "recognized" by possessing that one
 * secret value, not by anything about the device itself (no fingerprint,
 * no IP pinning) -- ip/userAgent are recorded for display/audit only
 * (admin's Login/session history), never checked at consume time.
 */

const COOKIE_NAME = process.env.TRUSTED_DEVICE_COOKIE_NAME || 'findmyvybe_device';
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days -- see docs/PHONE_FIRST_AUTH.md's decision trail

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function requestMeta(): Promise<{ userAgent?: string; ip?: string }> {
  try {
    const h = await headers();
    const userAgent = h.get('user-agent') || undefined;
    const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || undefined;
    return { userAgent, ip };
  } catch {
    return {};
  }
}

/**
 * Issues a fresh trusted-device token for userId and sets it as an
 * httpOnly cookie. Called right after createSession() at every real
 * sign-in call site (OTP verify, Google/Apple callback, passkey login) --
 * NOT from the device-login route's own successful consume, which calls
 * rotateTrustedDevice() instead (see below) so reuse doesn't require a
 * brand-new row every single time.
 */
export async function issueTrustedDevice(userId: string): Promise<void> {
  const token = crypto.randomBytes(32).toString('hex');
  const meta = await requestMeta();

  await db.trustedDevice.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + TTL_SECONDS * 1000),
      userAgent: meta.userAgent,
      ip: meta.ip,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: TTL_SECONDS,
  });
}

export type ConsumeTrustedDeviceResult = { ok: true; userId: string } | { ok: false };

/**
 * Looks up the trusted-device cookie, if any, and -- if it matches a
 * live, unexpired row -- ROTATES it: the old row is deleted and a brand
 * new token/row/cookie is issued in the same call, sliding the 30-day
 * window forward and ensuring the same raw token is never valid twice
 * (so a copied/leaked cookie value is only useful once). Does NOT check
 * User.status here -- callers (app/api/auth/device-login/route.ts) still
 * need their own DELETED-account check before creating a session, same
 * as every other sign-in route.
 */
export async function consumeTrustedDevice(): Promise<ConsumeTrustedDeviceResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return { ok: false };

  const row = await db.trustedDevice.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row || row.expiresAt.getTime() <= Date.now()) {
    cookieStore.set(COOKIE_NAME, '', { path: '/', maxAge: 0 });
    return { ok: false };
  }

  await db.trustedDevice.delete({ where: { id: row.id } });
  await issueTrustedDevice(row.userId);
  return { ok: true, userId: row.userId };
}

// There's no exported revokeAllTrustedDevices() here: the only root-app
// call site (app/api/me/delete/route.ts) needs the delete INSIDE a
// db.$transaction([...]) array alongside the User status update, which
// means a plain `db.trustedDevice.deleteMany({ where: { userId } })`
// passed directly, not a wrapper that awaits internally. The admin
// portal's "Force logout"/"Ban" actions and anonymizeUserAccount need
// the same one-liner but live in the separate admin/ Next.js app, which
// can't import this file at all (its own @/lib/* resolves under admin/,
// see admin/lib/db.ts's comment) -- see each call site's own comment for
// why User.sessionsInvalidatedAt and TrustedDevice rows are always
// cleared together.

/**
 * Revokes THIS device's trust only -- the plain "Log out" counterpart
 * to the bulk, every-device revokes above (self-service delete, admin
 * force-logout/ban). Bug fix 2026-10-05: /api/auth/logout previously
 * only called destroySession(), never this, so the trusted-device
 * cookie survived a normal logout untouched -- the next visit to
 * /login (e.g. the landing page's "Set your intent"/"Jump back in",
 * both of which just link there) silently signed the same person back
 * in via /api/auth/device-login before the form ever rendered, making
 * logout look like it did nothing. A plain logout deliberately only
 * revokes the device actually doing the logging out -- someone's other
 * signed-in devices (another phone, a laptop) stay trusted, same as
 * any normal "log out of this device" expectation.
 */
export async function revokeCurrentTrustedDevice(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  cookieStore.set(COOKIE_NAME, '', { path: '/', maxAge: 0 });
  if (!token) return;

  // Best-effort: a row that's already gone (expired and previously
  // swept, or never existed) is exactly the end state this function is
  // trying to reach anyway.
  await db.trustedDevice.deleteMany({ where: { tokenHash: hashToken(token) } });
}
