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
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1).max(200),
  role: z.enum(ROLES),
  temporaryPassword: z.string().min(1),
});

// Creates a new admin account -- no email delivery is wired up in this
// build, so the temporary password is set directly here and must be
// communicated to the new admin out of band. They enroll MFA themselves
// on first login (mfaEnabled starts false, so /api/auth/login routes them
// to mfa-setup automatically -- see that route's `nextStep` logic).
export async function POST(req: Request) {
  const guard = await requirePermission('adminUsers.manage');
  if ('error' in guard) return guard.error;
  const { admin } = guard;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  if (!isPasswordStrongEnough(parsed.data.temporaryPassword)) {
    return NextResponse.json({ error: 'Temporary password must be at least 12 characters.' }, { status: 400 });
  }

  const existing = await db.adminUser.findUnique({ where: { email: parsed.data.email } });
  if (existing) return NextResponse.json({ error: 'An admin with that email already exists.' }, { status: 409 });

  const passwordHash = await hashPassword(parsed.data.temporaryPassword);
  const created = await db.adminUser.create({
    data: {
      email: parsed.data.email,
      name: parsed.data.name,
      role: parsed.data.role,
      passwordHash,
      createdById: admin.id,
    },
  });

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'adminUser.create',
    category: 'system',
    targetType: 'AdminUser',
    targetId: created.id,
    newValue: { email: created.email, role: created.role },
    context: await getRequestContext(),
  });

  return NextResponse.json({ admin: { id: created.id, email: created.email, name: created.name, role: created.role } });
}
