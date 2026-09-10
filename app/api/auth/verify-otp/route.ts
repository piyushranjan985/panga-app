import { NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { createSession } from '@/lib/session';

const bodySchema = z.object({
  phone: z.string().trim(),
  code: z.string().trim().length(6),
});

function hashOtp(code: string) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

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

  const codeHash = hashOtp(code);
  const otp = await db.otpCode.findFirst({
    where: { userId: user.id, codeHash, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });

  if (!otp) {
    return NextResponse.json({ error: 'That code is wrong or expired.' }, { status: 401 });
  }

  await db.$transaction([
    db.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } }),
    db.user.update({ where: { id: user.id }, data: { phoneVerified: true, lastActiveAt: new Date() } }),
  ]);

  await createSession({ userId: user.id, phone: user.phone });

  return NextResponse.json({ ok: true, hasProfile: Boolean(user.profile) });
}
