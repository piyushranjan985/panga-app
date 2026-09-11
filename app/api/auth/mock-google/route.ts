import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { createSession } from '@/lib/session';

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
});

/**
 * Stand-in for "Sign in with Google" — there is no real Google OAuth wired
 * up yet, so this just simulates the profile data Google would normally
 * hand back after consent (an email address) and signs the user in with it.
 *
 * To go live: replace this route with a real OAuth flow, e.g. Auth.js
 * (next-auth) with the Google provider — https://authjs.dev/getting-started/providers/google.
 * That needs an OAuth client ID/secret from https://console.cloud.google.com,
 * which only you can create (a real account, outside what an AI assistant
 * can do on your behalf). Once you have those, swap this route for the
 * Auth.js callback and drop the mock consent screen in app/login/page.tsx.
 */
export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid email' }, { status: 400 });
  }
  const { email } = parsed.data;
  const googleId = `google:${email}`;

  try {
    const user = await db.user.upsert({
      where: { googleId },
      update: { lastActiveAt: new Date() },
      create: { googleId, email, emailVerified: true },
      include: { profile: true },
    });

    await createSession({ userId: user.id });

    return NextResponse.json({ ok: true, hasProfile: Boolean(user.profile) });
  } catch (err: unknown) {
    // This demo doesn't support linking multiple sign-in methods to one
    // account yet — if that email already belongs to a phone/email-OTP
    // account, upsert-by-googleId can't reuse it (the `email` column is
    // unique too). Fail with a clear message instead of a raw 500.
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002') {
      return NextResponse.json(
        { error: 'That email is already used by a different sign-in method in this demo — try phone or email code instead.' },
        { status: 409 },
      );
    }
    throw err;
  }
}
