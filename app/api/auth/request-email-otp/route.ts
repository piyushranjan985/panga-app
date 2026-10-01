import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { issueOtp } from '@/lib/otp';

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
});

/**
 * Email twin of /api/auth/request-otp — same OtpCode table, same mock
 * behaviour and same cooldown/attempt-cap access model (see lib/otp.ts),
 * just keyed by email instead of phone so someone without an Indian
 * mobile number can still sign in.
 */
export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid email' }, { status: 400 });
  }
  const { email } = parsed.data;

  // Same "tell them before they get surprised" lookup as
  // app/api/auth/request-otp/route.ts -- see the comment there.
  const existing = await db.user.findUnique({ where: { email }, include: { profile: true } });
  const user = existing ?? (await db.user.create({ data: { email } }));
  const alreadyHasProfile = Boolean(existing?.profile);

  const issued = await issueOtp(user.id);
  if (!issued.ok) {
    if (issued.reason === 'provider_not_configured') {
      return NextResponse.json({ error: 'Sign-in is temporarily unavailable — please try again shortly.' }, { status: 503 });
    }
    return NextResponse.json({ error: 'A code was already sent recently — check your inbox or wait a bit before requesting another.' }, { status: 429 });
  }

  return NextResponse.json({ ok: true, alreadyHasProfile });
}
