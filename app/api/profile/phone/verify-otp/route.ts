import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { consumeOtp } from '@/lib/otp';

const bodySchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^\+91[6-9]\d{9}$/, 'Enter a valid Indian mobile number, e.g. +919876543210'),
  code: z.string().trim().length(6),
});

/** Verify half of ./request-otp -- see that route's doc comment. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter the 8-digit code we sent you.' }, { status: 400 });
  }
  const { phone, code } = parsed.data;

  const result = await consumeOtp(session.userId, code, 'phone');
  if (!result.ok) {
    if (result.reason === 'provider_not_configured') {
      return NextResponse.json({ error: 'Sign-in is temporarily unavailable — please try again shortly.' }, { status: 503 });
    }
    if (result.reason === 'too_many_attempts') {
      return NextResponse.json({ error: 'Too many wrong guesses for that code — request a new one.' }, { status: 429 });
    }
    const detail =
      process.env.NODE_ENV === 'development'
        ? ` (dev detail: ${result.reason} -- see lib/otp.ts's consumeOtp doc comment)`
        : '';
    return NextResponse.json({ error: `That code is wrong or expired.${detail}` }, { status: 401 });
  }

  try {
    await db.user.update({ where: { id: session.userId }, data: { phone, phoneVerified: true } });
  } catch (err: unknown) {
    // A race: someone else attached this exact number between the
    // request-otp uniqueness check and this write finishing.
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002') {
      return NextResponse.json({ error: "That number's already linked to a different account." }, { status: 409 });
    }
    throw err;
  }

  return NextResponse.json({ ok: true });
}
