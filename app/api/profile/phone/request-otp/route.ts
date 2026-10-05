import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { issueOtp } from '@/lib/otp';

const bodySchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^\+91[6-9]\d{9}$/, 'Enter a valid Indian mobile number, e.g. +919876543210'),
});

/**
 * "Add & verify phone" from an authenticated context -- see
 * docs/PHONE_FIRST_AUTH.md. Used two ways: the mandatory /verify-phone
 * gate (a Google/Apple sign-up with no phone yet, no profile yet) and
 * the optional "Add phone" section in Profile settings (a grandfathered
 * phone-less account that already has a profile). Deliberately NOT the
 * same route as /api/auth/request-otp -- that one looks up or creates a
 * user BY phone number (the sign-in/sign-up shape); this one always
 * attaches to the CURRENT session's user, and refuses when the number
 * already belongs to someone else instead of silently switching accounts.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid phone number' }, { status: 400 });
  }
  const { phone } = parsed.data;

  const existing = await db.user.findUnique({ where: { phone }, select: { id: true } });
  if (existing && existing.id !== session.userId) {
    return NextResponse.json({ error: "That number's already linked to a different account." }, { status: 409 });
  }

  const issued = await issueOtp(session.userId, phone, 'phone');
  if (!issued.ok) {
    if (issued.reason === 'provider_not_configured') {
      return NextResponse.json({ error: 'Sign-in is temporarily unavailable — please try again shortly.' }, { status: 503 });
    }
    if (issued.reason === 'send_failed') {
      return NextResponse.json({ error: "We couldn't send that code — please try again in a moment." }, { status: 502 });
    }
    return NextResponse.json({ error: 'A code was already sent recently — check your messages or wait a bit before requesting another.' }, { status: 429 });
  }

  return NextResponse.json({ ok: true });
}
