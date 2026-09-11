import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { createSession } from '@/lib/session';
import { consumeOtp } from '@/lib/otp';

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z.string().trim().length(6),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter the 6-digit code we sent you.' }, { status: 400 });
  }
  const { email, code } = parsed.data;

  const user = await db.user.findUnique({ where: { email }, include: { profile: true } });
  if (!user) {
    return NextResponse.json({ error: 'Request a code first.' }, { status: 404 });
  }

  const valid = await consumeOtp(user.id, code);
  if (!valid) {
    return NextResponse.json({ error: 'That code is wrong or expired.' }, { status: 401 });
  }

  await db.user.update({ where: { id: user.id }, data: { emailVerified: true, lastActiveAt: new Date() } });
  await createSession({ userId: user.id });

  return NextResponse.json({ ok: true, hasProfile: Boolean(user.profile) });
}
