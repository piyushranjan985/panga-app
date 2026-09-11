import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { issueOtp } from '@/lib/otp';

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
});

/**
 * Email twin of /api/auth/request-otp — same OtpCode table, same mock
 * behaviour (see lib/otp.ts), just keyed by email instead of phone so
 * someone without an Indian mobile number can still sign in.
 */
export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid email' }, { status: 400 });
  }
  const { email } = parsed.data;

  const user = await db.user.upsert({
    where: { email },
    update: {},
    create: { email },
  });

  const { devHint } = await issueOtp(user.id);

  return NextResponse.json({ ok: true, devHint });
}
