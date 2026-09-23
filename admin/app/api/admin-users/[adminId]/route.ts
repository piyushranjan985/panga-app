import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';
import { hashPassword, isPasswordStrongEnough } from '@/lib/password';

const ROLES = [
  'SUPER_ADMIN', 'ADMIN', 'OPERATIONS', 'TRUST_AND_SAFETY', 'MODERATOR',
  'CUSTOMER_SUPPORT', 'PRIVACY_OFFICER', 'COMPLIANCE_OFFICER', 'FINANCE',
  'ANALYTICS', 'READ_ONLY',
] as const;

const bodySchema = z.object({
  role: z.enum(ROLES).optional(),
  isActive: z.boolean().optional(),
  resetMfa: z.boolean().optional(),
  newPassword: z.string().optional(),
  reason: z.string().trim().max(2000).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ adminId: string }> }) {
  const guard = await requirePermission('adminUsers.manage');
  if ('error' in guard) return guard.error;
  const { admin } = guard;
  const { adminId } = await params;

  // Never let an admin change their own role or deactivate themselves
  // through this endpoint -- with "just one admin today" (see
  // lib/configApproval.ts's note on the same theme), a self-edit gone
  // wrong here would be a real, hard-to-recover lockout. A second admin
  // has to make either change.
  if (adminId === admin.id) {
    return NextResponse.json({ error: 'You cannot change your own role or active status. Ask another admin to do it.' }, { status: 400 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const existing = await db.adminUser.findUnique({ where: { id: adminId } });
  if (!existing) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const data: Record<string, unknown> = {};
  const auditAction: string[] = [];

  if (parsed.data.role && parsed.data.role !== existing.role) {
    data.role = parsed.data.role;
    auditAction.push('role');
  }
  if (parsed.data.isActive !== undefined && parsed.data.isActive !== existing.isActive) {
    data.isActive = parsed.data.isActive;
    // Deactivating revokes every live session immediately, same as a
    // consumer force-logout.
    if (!parsed.data.isActive) {
      await db.adminSession.updateMany({ where: { adminId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    auditAction.push(parsed.data.isActive ? 'reactivate' : 'deactivate');
  }
  if (parsed.data.resetMfa) {
    data.mfaEnabled = false;
    data.mfaSecret = null;
    data.mfaRecoveryCodes = [];
    auditAction.push('resetMfa');
  }
  if (parsed.data.newPassword) {
    if (!isPasswordStrongEnough(parsed.data.newPassword)) {
      return NextResponse.json({ error: 'New password must be at least 12 characters.' }, { status: 400 });
    }
    data.passwordHash = await hashPassword(parsed.data.newPassword);
    data.failedLoginAttempts = 0;
    data.lockedUntil = null;
    auditAction.push('resetPassword');
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  }

  await db.adminUser.update({ where: { id: adminId }, data });

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: `adminUser.${auditAction.join('+')}`,
    category: 'system',
    targetType: 'AdminUser',
    targetId: adminId,
    previousValue: { role: existing.role, isActive: existing.isActive },
    newValue: { role: parsed.data.role ?? existing.role, isActive: parsed.data.isActive ?? existing.isActive },
    reason: parsed.data.reason,
    context: await getRequestContext(),
  });

  return NextResponse.json({ ok: true });
}
