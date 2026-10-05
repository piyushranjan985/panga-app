import { NextResponse } from 'next/server';
import { destroySession } from '@/lib/session';
import { revokeCurrentTrustedDevice } from '@/lib/trustedDevice';

/**
 * Also revokes this device's trusted-device cookie, not just the
 * session -- see lib/trustedDevice.ts's revokeCurrentTrustedDevice doc
 * comment for the bug this fixes (logout silently undone by the very
 * next /login visit). Only this device loses its trust; the user's
 * other signed-in devices are untouched, same as a normal "log out of
 * this device" expectation (see docs/PHONE_FIRST_AUTH.md §2 for the
 * contrast with the bulk, every-device revokes elsewhere).
 */
export async function POST() {
  await destroySession();
  await revokeCurrentTrustedDevice();
  return NextResponse.json({ ok: true });
}
