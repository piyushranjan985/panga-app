import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { createSession } from '@/lib/session';
import { isBetaAllowed, BETA_LOCKED_MESSAGE } from '@/lib/auth/betaAllowlist';

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
});

/**
 * Stand-in for "Sign in with Facebook", posted to by the mock consent
 * form in app/login/page.tsx -- simulates the profile data Facebook
 * would hand back after consent.
 *
 * A REAL Facebook OAuth flow now exists alongside this one:
 * app/api/auth/facebook/route.ts + .../callback/route.ts (see
 * lib/auth/facebookOAuth.ts). Once FACEBOOK_APP_ID/SECRET are set, the
 * login page's "Continue with Facebook" button navigates straight to
 * the real flow; this route stays as the fallback exactly like
 * mock-google's does.
 *
 * (There used to be a "Continue with Instagram" button that also
 * posted here -- removed 2026-09-27 rather than kept mocked, since Meta
 * has no standalone consumer OAuth for Instagram at all, so unlike this
 * Facebook flow there was never a real one for it to grow into. See
 * lib/auth/facebookOAuth.ts's top comment.)
 */
export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid email' }, { status: 400 });
  }
  const { email } = parsed.data;

  if (!isBetaAllowed(email)) {
    return NextResponse.json({ error: BETA_LOCKED_MESSAGE }, { status: 403 });
  }

  const facebookId = `facebook:${email}`;

  try {
    const user = await db.user.upsert({
      where: { facebookId },
      update: { lastActiveAt: new Date() },
      create: { facebookId, email, emailVerified: true },
      include: { profile: true },
    });

    await createSession({ userId: user.id }, { method: 'facebook' });

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
