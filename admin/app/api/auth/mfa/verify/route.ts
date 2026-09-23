import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { verifyTotp, consumeRecoveryCode } from '@/lib/mfa';
import { readPendingMfaAdminId, clearPendingMfaCookie } from '@/lib/pendingMfa';
import { createAdminSession } from '@/lib/session';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';

const bodySchema = z.object({ code: z.string().trim().min(6).max(64) });

export async function POST(req: Request) {
  const adminId = await readPendingMfaAdminId();
  if (!adminId) {
    return NextResponse.json({ error: 'Your sign-in attempt expired. Start over.' }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter your 6-digit code or a recovery code.' }, { status: 400 });
  }

  const admin = await db.adminUser.findUnique({ where: { id: adminId } });
  const context = await getRequestContext();
  if (!admin || !admin.isActive || !admin.mfaEnabled || !admin.mfaSecret) {
    return NextResponse.json({ error: 'MFA is not set up for this account.' }, { status: 400 });
  }

  const { code } = parsed.data;
  let usedRecoveryCode = false;

  let ok = verifyTotp(code, admin.mfaSecret);
  if (!ok) {
    const remaining = await consumeRecoveryCode(code, admin.mfaRecoveryCodes);
    if (remaining) {
      ok = true;
      usedRecoveryCode = true;
      await db.adminUser.update({ where: { id: admin.id }, data: { mfaRecoveryCodes: remaining } });
    }
  }

  if (!ok) {
    await writeAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: 'auth.mfa_failed',
      category: 'auth',
      targetType: 'AdminUser',
      targetId: admin.id,
      context,
    });
    return NextResponse.json({ error: 'That code is wrong or expired.' }, { status: 401 });
  }

  await clearPendingMfaCookie();
  await db.adminUser.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date(), lastLoginIp: context.ip },
  });
  await createAdminSession(admin.id, context.ip, context.userAgent);
  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: usedRecoveryCode ? 'auth.login_via_recovery_code' : 'auth.login',
    category: 'auth',
    targetType: 'AdminUser',
    targetId: admin.id,
    context,
  });

  return NextResponse.json({ ok: true, recoveryCodeUsed: usedRecoveryCode });
}
