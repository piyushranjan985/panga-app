import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { verifyTotp, generateRecoveryCodes } from '@/lib/mfa';
import { readPendingMfaAdminId, clearPendingMfaCookie } from '@/lib/pendingMfa';
import { createAdminSession } from '@/lib/session';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';

const bodySchema = z.object({ code: z.string().trim().length(6) });

export async function POST(req: Request) {
  const adminId = await readPendingMfaAdminId();
  if (!adminId) {
    return NextResponse.json({ error: 'Your sign-in attempt expired. Start over.' }, { status: 401 });
  }
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter the 6-digit code from your authenticator app.' }, { status: 400 });
  }

  const admin = await db.adminUser.findUnique({ where: { id: adminId } });
  const context = await getRequestContext();
  if (!admin || !admin.isActive || !admin.mfaSecret) {
    return NextResponse.json({ error: 'Start MFA setup again.' }, { status: 400 });
  }

  if (!verifyTotp(parsed.data.code, admin.mfaSecret)) {
    return NextResponse.json({ error: 'That code is wrong. Check the time on your phone and try again.' }, { status: 401 });
  }

  const { plain, hashed } = await generateRecoveryCodes();
  await db.adminUser.update({
    where: { id: admin.id },
    data: { mfaEnabled: true, mfaRecoveryCodes: hashed, lastLoginAt: new Date(), lastLoginIp: context.ip },
  });
  await clearPendingMfaCookie();
  await createAdminSession(admin.id, context.ip, context.userAgent);
  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'auth.mfa_enabled',
    category: 'auth',
    targetType: 'AdminUser',
    targetId: admin.id,
    context,
  });

  // Recovery codes are returned exactly once -- they're stored hashed and
  // cannot be recovered later, only regenerated (invalidating the old set).
  return NextResponse.json({ ok: true, recoveryCodes: plain });
}
