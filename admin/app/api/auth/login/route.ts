import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { verifyPassword } from '@/lib/password';
import { setPendingMfaCookie } from '@/lib/pendingMfa';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a valid email and password.' }, { status: 400 });
  }
  const { email, password } = parsed.data;
  const context = await getRequestContext();

  const admin = await db.adminUser.findUnique({ where: { email } });

  // Same generic error for "no such admin" and "wrong password" -- never
  // let a login form confirm which admin emails exist.
  const genericError = () => NextResponse.json({ error: 'Incorrect email or password.' }, { status: 401 });

  if (!admin || !admin.isActive) {
    return genericError();
  }

  if (admin.lockedUntil && admin.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil((admin.lockedUntil.getTime() - Date.now()) / 60000);
    return NextResponse.json(
      { error: `Too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.` },
      { status: 429 },
    );
  }

  const valid = await verifyPassword(password, admin.passwordHash);
  if (!valid) {
    const attempts = admin.failedLoginAttempts + 1;
    await db.adminUser.update({
      where: { id: admin.id },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil: attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null,
      },
    });
    await writeAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: 'auth.login_failed',
      category: 'auth',
      targetType: 'AdminUser',
      targetId: admin.id,
      context,
    });
    return genericError();
  }

  await db.adminUser.update({ where: { id: admin.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
  await setPendingMfaCookie(admin.id);

  return NextResponse.json({
    ok: true,
    mfaEnabled: admin.mfaEnabled,
    nextStep: admin.mfaEnabled ? 'mfa' : 'mfa-setup',
  });
}
