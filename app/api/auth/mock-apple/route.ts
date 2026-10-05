import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { createSession } from '@/lib/session';
import { issueTrustedDevice } from '@/lib/trustedDevice';
import { nextPathAfterAuth } from '@/lib/auth/postAuthRedirect';
import { isBetaAllowed, BETA_LOCKED_MESSAGE } from '@/lib/auth/betaAllowlist';
import { DELETED_ACCOUNT_MESSAGE } from '@/lib/accountEnforcement';
import { isAppleOAuthConfigured } from '@/lib/auth/appleOAuth';

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
});

/**
 * Stand-in for "Sign in with Apple" -- exact mirror of
 * app/api/auth/mock-google/route.ts, just keyed by appleId. Refuses to
 * run at all once the real flow is configured (see that file's doc
 * comment for why: without this, posting here directly would let
 * anyone claim literally any email address with zero real Apple
 * verification).
 */
export async function POST(req: Request) {
  if (isAppleOAuthConfigured()) {
    return NextResponse.json({ error: 'This sign-in method is no longer available.' }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid email' }, { status: 400 });
  }
  const { email } = parsed.data;

  if (!isBetaAllowed(email)) {
    return NextResponse.json({ error: BETA_LOCKED_MESSAGE }, { status: 403 });
  }

  const appleId = `apple:${email}`;

  try {
    const user = await db.user.upsert({
      where: { appleId },
      update: { lastActiveAt: new Date() },
      create: { appleId, email, emailVerified: true },
      include: { profile: true },
    });

    if (user.status === 'DELETED') {
      return NextResponse.json({ error: DELETED_ACCOUNT_MESSAGE }, { status: 403 });
    }

    await createSession({ userId: user.id }, { method: 'apple' });
    await issueTrustedDevice(user.id);

    return NextResponse.json({ ok: true, next: nextPathAfterAuth({ phoneVerified: user.phoneVerified, profile: user.profile }) });
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
