import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { createSession } from '@/lib/session';
import { consumeOtp } from '@/lib/otp';
import { DELETED_ACCOUNT_MESSAGE } from '@/lib/accountEnforcement';

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z.string().trim().length(8),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter the 8-digit code we sent you.' }, { status: 400 });
  }
  const { email, code } = parsed.data;

  const user = await db.user.findUnique({ where: { email }, include: { profile: true } });
  if (!user) {
    return NextResponse.json({ error: 'Request a code first.' }, { status: 404 });
  }

  const result = await consumeOtp(user.id, code);
  if (!result.ok) {
    if (result.reason === 'provider_not_configured') {
      return NextResponse.json({ error: 'Sign-in is temporarily unavailable — please try again shortly.' }, { status: 503 });
    }
    if (result.reason === 'too_many_attempts') {
      return NextResponse.json(
        { error: 'Too many wrong guesses for that code — request a new one.' },
        { status: 429 },
      );
    }
    // Dev-only: says exactly which of the remaining ways this failed,
    // instead of the deliberately-vague message every real user gets --
    // see consumeOtp's doc comment in lib/otp.ts for why. Never runs in
    // production (NODE_ENV is always 'production' there, Vercel or
    // otherwise), so this can't be used to enumerate valid/expired codes
    // against a real account.
    const detail =
      process.env.NODE_ENV === 'development'
        ? ` (dev detail: ${result.reason} -- see lib/otp.ts's consumeOtp doc comment)`
        : '';
    return NextResponse.json({ error: `That code is wrong or expired.${detail}` }, { status: 401 });
  }

  if (user.status === 'DELETED') {
    return NextResponse.json({ error: DELETED_ACCOUNT_MESSAGE }, { status: 403 });
  }

  await db.user.update({ where: { id: user.id }, data: { emailVerified: true, lastActiveAt: new Date() } });
  await createSession({ userId: user.id }, { method: 'email_otp' });

  return NextResponse.json({ ok: true, hasProfile: Boolean(user.profile) });
}
