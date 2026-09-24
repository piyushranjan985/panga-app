import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { hashPassword, isPasswordStrongEnough, verifyPassword } from '@/lib/password';
import { verifyTotp } from '@/lib/mfa';
import { getCurrentAdmin } from '@/lib/session';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';

const bodySchema = z.object({
  currentPassword: z.string().min(1),
  // 6-digit TOTP code, required whenever MFA is already enabled -- proves
  // this is really the account owner, the same bar as lib/session.ts's
  // step-up check, not just "knows the current password".
  code: z.string().trim().length(6).optional(),
  newPassword: z.string().min(1),
});

// Self-service password change. Deliberately separate from
// PATCH /api/admin-users/[adminId] (adminUsers.manage), which explicitly
// refuses to let an admin edit themselves -- with a single Super Admin
// today, "ask another admin to do it" isn't an option for your own
// password, so this route exists specifically to let *you* change *your
// own* password, gated on re-proving who you are rather than on a
// separate permission.
export async function POST(req: Request) {
  const current = await getCurrentAdmin();
  if (!current) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter your current password and a new password.' }, { status: 400 });
  }
  const { currentPassword, code, newPassword } = parsed.data;

  if (!isPasswordStrongEnough(newPassword)) {
    return NextResponse.json({ error: 'New password must be at least 12 characters.' }, { status: 400 });
  }

  const admin = await db.adminUser.findUnique({ where: { id: current.admin.id } });
  if (!admin) return NextResponse.json({ error: 'Account not found.' }, { status: 401 });

  const context = await getRequestContext();
  const passwordOk = await verifyPassword(currentPassword, admin.passwordHash);
  if (!passwordOk) {
    await writeAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: 'auth.change_password_failed',
      category: 'auth',
      context,
    });
    return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 401 });
  }

  if (admin.mfaEnabled) {
    if (!code || !admin.mfaSecret || !verifyTotp(code, admin.mfaSecret)) {
      return NextResponse.json({ error: 'Enter your current 6-digit authenticator code.' }, { status: 401 });
    }
  }

  await db.adminUser.update({
    where: { id: admin.id },
    data: { passwordHash: await hashPassword(newPassword), failedLoginAttempts: 0, lockedUntil: null },
  });

  // Sign every *other* session out -- if the old password leaked, changing
  // it should also kill any session someone else opened with it. The
  // session making this request is excluded so you're not immediately
  // logged out of the tab you just used.
  await db.adminSession.updateMany({
    where: { adminId: admin.id, revokedAt: null, id: { not: current.sessionId } },
    data: { revokedAt: new Date() },
  });

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'auth.password_changed',
    category: 'auth',
    context,
  });

  return NextResponse.json({ ok: true });
}
