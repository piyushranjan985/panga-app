import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import crypto from 'node:crypto';

const bodySchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^\+91[6-9]\d{9}$/, 'Enter a valid Indian mobile number, e.g. +919876543210'),
});

const MOCK_OTP = '123456';
const OTP_TTL_MINUTES = 5;

function hashOtp(code: string) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

/**
 * Requests an OTP for a phone number. In dev/mock mode this always "sends"
 * the static code 123456 and never calls a real SMS provider. Swap the
 * mock branch below for MSG91 / Gupshup / Twilio Verify before launch —
 * see .env.example and the strategy doc's Trust & Safety section.
 */
export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid phone number' }, { status: 400 });
  }
  const { phone } = parsed.data;

  const user = await db.user.upsert({
    where: { phone },
    update: {},
    create: { phone },
  });

  const provider = process.env.OTP_PROVIDER ?? 'mock';
  const code = provider === 'mock' ? MOCK_OTP : crypto.randomInt(100000, 999999).toString();

  await db.otpCode.create({
    data: {
      userId: user.id,
      codeHash: hashOtp(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
    },
  });

  if (provider !== 'mock') {
    // TODO: call the real SMS provider here with `code`.
  }

  return NextResponse.json({
    ok: true,
    devHint: provider === 'mock' ? `Dev mode: use OTP ${MOCK_OTP}` : undefined,
  });
}
