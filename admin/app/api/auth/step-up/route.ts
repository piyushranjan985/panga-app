import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { verifyPassword } from '@/lib/password';
import { verifyTotp } from '@/lib/mfa';
import { getCurrentAdmin, recordStepUp } from '@/lib/session';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';

const bodySchema = z.object({ password: z.string().min(1), code: z.string().trim().length(6) });

// Re-proves identity (password + a fresh TOTP code) right before a
// destructive/high-risk action -- see lib/rbac.ts STEP_UP_REQUIRED. This is
// deliberately separate from login: an admin can stay signed in for the
// session TTL, but banning a user or approving a deletion request always
// demands this within the last ADMIN_STEP_UP_TTL_MINUTES.
export async function POST(req: Request) {
  const current = await getCurrentAdmin();
  if (!current) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter your password and current 6-digit code.' }, { status: 400 });
  }

  const admin = await db.adminUser.findUnique({ where: { id: current.admin.id } });
  if (!admin || !admin.mfaSecret) {
    return NextResponse.json({ error: 'Account not found.' }, { status: 401 });
  }

  const passwordOk = await verifyPassword(parsed.data.password, admin.passwordHash);
  const codeOk = passwordOk && verifyTotp(parsed.data.code, admin.mfaSecret);
  const context = await getRequestContext();

  if (!passwordOk || !codeOk) {
    await writeAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: 'auth.step_up_failed',
      category: 'auth',
      context,
    });
    return NextResponse.json({ error: 'Password or code incorrect.' }, { status: 401 });
  }

  await recordStepUp(current.sessionId);
  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'auth.step_up_succeeded',
    category: 'auth',
    context,
  });

  return NextResponse.json({ ok: true });
}
