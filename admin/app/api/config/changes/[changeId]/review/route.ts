import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';
import { applyConfigChange } from '@/lib/configApproval';

const bodySchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  reason: z.string().trim().max(2000).optional(),
});

// config.approve is step-up gated (lib/rbac.ts STEP_UP_REQUIRED) -- same
// bar as banning a user. Approving applies the change immediately (see
// lib/configApproval.ts for why there's no separate "apply" step).
export async function PATCH(req: Request, { params }: { params: Promise<{ changeId: string }> }) {
  const guard = await requirePermission('config.approve');
  if ('error' in guard) return guard.error;
  const { admin } = guard;
  const { changeId } = await params;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const change = await db.appConfigChange.findUnique({ where: { id: changeId } });
  if (!change) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  if (change.status !== 'PENDING_APPROVAL') return NextResponse.json({ error: 'This change has already been reviewed.' }, { status: 400 });

  if (parsed.data.status === 'APPROVED') {
    await applyConfigChange(change);
  }

  const updated = await db.appConfigChange.update({
    where: { id: changeId },
    data: {
      status: parsed.data.status === 'APPROVED' ? 'APPLIED' : 'REJECTED',
      reviewedById: admin.id,
      reviewedAt: new Date(),
      appliedAt: parsed.data.status === 'APPROVED' ? new Date() : undefined,
      reviewNote: parsed.data.reason,
    },
  });

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: parsed.data.status === 'APPROVED' ? 'config.change.approve' : 'config.change.reject',
    category: 'config',
    targetType: 'AppConfigChange',
    targetId: changeId,
    previousValue: { status: change.status },
    newValue: { status: updated.status },
    reason: parsed.data.reason,
    context: await getRequestContext(),
  });

  return NextResponse.json({ ok: true });
}
