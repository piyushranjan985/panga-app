import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { issueOtp } from '@/lib/otp';

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
});

/**
 * "Add & verify email" from an authenticated context -- the Profile-
 * settings half of findmyVybe's "phone first, email later" flow (see
 * docs/PHONE_FIRST_AUTH.md). Same relationship to /api/auth/request-
 * email-otp as app/api/profile/phone/request-otp/route.ts has to
 * /api/auth/request-otp: that one is sign-in-by-email (and, since the
 * phone-first change, only for an email that already has an account);
 * this one always attaches to the CURRENT session's user.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid email' }, { status: 400 });
  }
  const { email } = parsed.data;

  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing && existing.id !== session.userId) {
    return NextResponse.json({ error: 'That email is already linked to a different account.' }, { status: 409 });
  }

  const issued = await issueOtp(session.userId, email, 'email');
  if (!issued.ok) {
    if (issued.reason === 'provider_not_configured') {
      return NextResponse.json({ error: 'Sign-in is temporarily unavailable — please try again shortly.' }, { status: 503 });
    }
    if (issued.reason === 'send_failed') {
      return NextResponse.json({ error: "We couldn't send that code — please try again in a moment." }, { status: 502 });
    }
    return NextResponse.json({ error: 'A code was already sent recently — check your inbox or wait a bit before requesting another.' }, { status: 429 });
  }

  return NextResponse.json({ ok: true });
}
