import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createSession } from '@/lib/session';
import { consumeTrustedDevice } from '@/lib/trustedDevice';
import { nextPathAfterAuth } from '@/lib/auth/postAuthRedirect';
import { DELETED_ACCOUNT_MESSAGE } from '@/lib/accountEnforcement';

/**
 * POST /api/auth/device-login -- the actual SMS/email-OTP cost fix (see
 * docs/PHONE_FIRST_AUTH.md). Called silently by app/login/page.tsx on
 * mount, before showing the phone/email form: if this browser is holding
 * a live trusted-device cookie, this creates a brand-new session with NO
 * OTP at all and rotates the trusted-device token (see
 * lib/trustedDevice.ts's consumeTrustedDevice doc comment). No cookie, or
 * an expired/unknown one, is a normal, silent miss -- the login page
 * just falls through to the usual form.
 */
export async function POST() {
  const result = await consumeTrustedDevice();
  if (!result.ok) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // Same DELETED-account backstop every other sign-in route has -- a
  // trusted device for a since-deleted account should never silently
  // issue a fresh session just because the cookie still verifies.
  const user = await db.user.findUnique({ where: { id: result.userId }, include: { profile: true } });
  if (!user || user.status === 'DELETED') {
    return NextResponse.json({ ok: false, error: user ? DELETED_ACCOUNT_MESSAGE : undefined }, { status: 401 });
  }

  await createSession({ userId: user.id }, { method: 'trusted_device' });

  return NextResponse.json({ ok: true, next: nextPathAfterAuth({ phoneVerified: user.phoneVerified, profile: user.profile }) });
}
