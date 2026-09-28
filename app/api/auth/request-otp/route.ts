import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { issueOtp } from '@/lib/otp';

const bodySchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^\+91[6-9]\d{9}$/, 'Enter a valid Indian mobile number, e.g. +919876543210'),
});

/**
 * Requests an OTP for a phone number. See lib/otp.ts for how the code
 * itself is generated/mocked, the fixed shared code, and the request
 * cooldown / attempt cap that stand in for real per-person access control
 * on this path (open to any phone number by design).
 */
export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid phone number' }, { status: 400 });
  }
  const { phone } = parsed.data;

  // Look the number up before creating anything -- lets the client tell
  // someone "welcome back, you already have an account" instead of
  // silently treating every phone number the same way. OTP request/verify
  // doubles as both sign-up and sign-in (see app/verify/page.tsx routing
  // on hasProfile), so this never blocks anything -- it's purely for
  // messaging.
  const existing = await db.user.findUnique({ where: { phone }, include: { profile: true } });
  const user = existing ?? (await db.user.create({ data: { phone } }));
  const alreadyHasProfile = Boolean(existing?.profile);

  const issued = await issueOtp(user.id);
  if (!issued.ok) {
    return NextResponse.json({ error: 'A code was already sent recently — check your messages or wait a bit before requesting another.' }, { status: 429 });
  }

  return NextResponse.json({ ok: true, alreadyHasProfile });
}
