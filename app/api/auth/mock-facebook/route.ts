import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { createSession } from '@/lib/session';

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
});

/**
 * Stand-in for "Sign in with Facebook", posted to by the mock consent
 * form in app/login/page.tsx -- simulates the profile data Facebook
 * would hand back after consent. Also what "Continue with Instagram"
 * posts to (see app/login/page.tsx's SOCIAL_ENDPOINT comment) -- Meta
 * retired general-purpose "Sign in with Instagram" for non-business
 * apps, so unlike Google/Facebook, Instagram has no real flow to grow
 * into; this mock is permanent for that button, not a placeholder.
 *
 * A REAL Facebook OAuth flow now exists alongside this one (Facebook
 * only, never Instagram): app/api/auth/facebook/route.ts + .../callback/
 * route.ts (see lib/auth/facebookOAuth.ts). Once FACEBOOK_APP_ID/SECRET
 * are set, the login page's "Continue with Facebook" button navigates
 * straight to the real flow; this route stays as the fallback (and for
 * Instagram, permanently) exactly like mock-google's does.
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
