import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { createSession } from '@/lib/session';

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
});

/**
 * Stand-in for "Sign in with Google", posted to by the mock consent form
 * in app/login/page.tsx -- simulates the profile data Google would hand
 * back after consent (an email address) and signs the user in with it.
 *
 * A REAL Google OAuth flow now exists alongside this one:
 * app/api/auth/google/route.ts + .../callback/route.ts (see
 * lib/auth/googleOAuth.ts). Once GOOGLE_CLIENT_ID/SECRET are set, the
 * login page's "Continue with Google" button navigates straight to the
 * real flow and this route is never reached from there again -- it's
 * only still hit directly if GOOGLE_CLIENT_ID/SECRET are unset (the
 * button then redirects back to the mock form on purpose, see
 * app/api/auth/google/route.ts) or in an existing test that still posts
 * here directly. Left in place rather than deleted so local dev/tests
 * keep working with zero external setup.
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

    await createSession({ userId: user.id }, { method: 'google' });

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
