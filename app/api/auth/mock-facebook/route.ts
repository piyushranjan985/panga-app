import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { createSession } from '@/lib/session';

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
});

/**
 * Stand-in for "Sign in with Facebook" (the closest real equivalent to an
 * Instagram login — Meta retired general-purpose "Sign in with Instagram"
 * for non-business apps, so there isn't a working Instagram button to wire
 * up here). No real Meta OAuth is connected; this simulates the profile
 * data Facebook would hand back after consent.
 *
 * To go live: real Meta OAuth via Auth.js's Facebook provider —
 * https://authjs.dev/getting-started/providers/facebook — needs an app
 * created at https://developers.facebook.com, which only you can do.
 */
export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid email' }, { status: 400 });
  }
  const { email } = parsed.data;
  const facebookId = `facebook:${email}`;

  try {
    const user = await db.user.upsert({
      where: { facebookId },
      update: { lastActiveAt: new Date() },
      create: { facebookId, email, emailVerified: true },
      include: { profile: true },
    });

    await createSession({ userId: user.id });

    return NextResponse.json({ ok: true, hasProfile: Boolean(user.profile) });
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002') {
      return NextResponse.json(
        { error: 'That email is already used by a different sign-in method in this demo — try phone or email code instead.' },
        { status: 409 },
      );
    }
    throw err;
  }
}
