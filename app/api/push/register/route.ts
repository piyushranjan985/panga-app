import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

const PLATFORMS = ['ios', 'android', 'web'] as const;

const bodySchema = z.object({
  token: z.string().trim().min(1),
  platform: z.enum(PLATFORMS),
});

// Registers (or re-registers) one device for push -- called by
// lib/native.ts's requestPushPermission() right after the OS/browser
// hands back an FCM registration token, for both the Capacitor native
// shells and the web app (see docs/PUSH_NOTIFICATIONS.md §2/§4).
// `token` is @unique on DeviceToken: upserting means a token that moved
// to a different account (rare, but possible on a shared device) is
// simply reassigned rather than erroring, and a previously-revoked token
// FCM hands back again (token reuse after reinstall) is un-revoked.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  await db.deviceToken.upsert({
    where: { token: parsed.data.token },
    create: { token: parsed.data.token, userId: session.userId, platform: parsed.data.platform },
    update: { userId: session.userId, platform: parsed.data.platform, lastSeenAt: new Date(), revokedAt: null },
  });

  return NextResponse.json({ ok: true });
}

// Unregisters one device -- best-effort, called on logout/toggle-off so
// a signed-out device stops receiving pushes for the account it's no
// longer signed into. Not finding the token is not an error (it may
// already be gone, or never finished registering).
export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = z.object({ token: z.string().trim().min(1) }).safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  await db.deviceToken.deleteMany({ where: { token: parsed.data.token, userId: session.userId } });
  return NextResponse.json({ ok: true });
}
