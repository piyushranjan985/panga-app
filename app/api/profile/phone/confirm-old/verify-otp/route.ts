import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { consumeOtp } from '@/lib/otp';

const bodySchema = z.object({ code: z.string().trim().length(6) });

/**
 * Verify half of ./request-otp -- see that route's doc comment. Success
 * here is exactly what ../../request-otp/route.ts's hasRecentConfirmedOtp
 * check looks for (a consumed OtpCode row against whichever destination
 * ./request-otp picked) -- nothing else to persist, this route's only
 * job is making that row exist.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter the 6-digit code we sent you.' }, { status: 400 });
  }

  // Mirrors ./request-otp's own "prefer email, fall back to phone" pick.
  // consumeOtp's channel argument is only a fallback for a row that
  // somehow has no stored channel (see its doc comment) -- it doesn't
  // have to be exact for correctness, but getting it right costs nothing.
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { email: true, emailVerified: true },
  });
  const channel = user?.email && user.emailVerified ? 'email' : 'phone';

  const result = await consumeOtp(session.userId, parsed.data.code, channel);
  if (!result.ok) {
    if (result.reason === 'provider_not_configured') {
      return NextResponse.json({ error: 'Sign-in is temporarily unavailable — please try again shortly.' }, { status: 503 });
    }
    if (result.reason === 'too_many_attempts') {
      return NextResponse.json({ error: 'Too many wrong guesses for that code — request a new one.' }, { status: 429 });
    }
    return NextResponse.json({ error: 'That code is wrong or expired.' }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
