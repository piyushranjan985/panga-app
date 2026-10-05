import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { createSession } from '@/lib/session';
import { consumeOtp } from '@/lib/otp';
import { issueTrustedDevice } from '@/lib/trustedDevice';
import { nextPathAfterAuth } from '@/lib/auth/postAuthRedirect';
import { DELETED_ACCOUNT_MESSAGE } from '@/lib/accountEnforcement';

const bodySchema = z.object({
  phone: z.string().trim(),
  code: z.string().trim().length(6),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter the 6-digit code we sent you.' }, { status: 400 });
  }
  const { phone, code } = parsed.data;

  const user = await db.user.findUnique({ where: { phone }, include: { profile: true } });
  if (!user) {
    return NextResponse.json({ error: 'Request an OTP first.' }, { status: 404 });
  }

  const result = await consumeOtp(user.id, code, 'phone');
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

  // Checked *before* creating a session, not after -- see
  // lib/accountEnforcement.ts's DELETED_ACCOUNT_MESSAGE doc comment for
  // the other five places this same check lives.
  if (user.status === 'DELETED') {
    return NextResponse.json({ error: DELETED_ACCOUNT_MESSAGE }, { status: 403 });
  }

  await db.user.update({ where: { id: user.id }, data: { phoneVerified: true, lastActiveAt: new Date() } });
  // result.channel is the channel this code actually went out on, which
  // can be 'email' here even though this is the phone sign-in route --
  // see /api/auth/request-otp's doc comment and docs/PHONE_FIRST_AUTH.md
  // §9. Recording the real channel keeps LoginEvent accurate rather than
  // always claiming phone_otp for a route that no longer always means
  // that.
  await createSession({ userId: user.id }, { method: result.channel === 'email' ? 'email_otp' : 'phone_otp' });
  // Phone is the strong anti-fake-account signal this whole flow exists
  // for (see docs/PHONE_FIRST_AUTH.md) -- a successful phone OTP earns a
  // trusted device immediately, same as every other real sign-in.
  await issueTrustedDevice(user.id);

  return NextResponse.json({ ok: true, next: nextPathAfterAuth({ phoneVerified: true, profile: user.profile }) });
}
