import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';
import { anonymizeUserAccount } from '@/lib/userLifecycle';

const bodySchema = z.object({
  status: z.enum(['VERIFYING_IDENTITY', 'IN_PROGRESS', 'COMPLETED', 'REJECTED']),
  reason: z.string().trim().max(2000).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const guard = await requirePermission('privacy.requests.handle');
  if ('error' in guard) return guard.error;
  const { admin } = guard;
  const { requestId } = await params;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const existing = await db.privacyRequest.findUnique({ where: { id: requestId } });
  if (!existing) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  // DPDP: a deletion request can't proceed while a legal hold is active on
  // that user -- the hold has to be released first (see /privacy/legal-holds).
  if (parsed.data.status === 'COMPLETED' && existing.type === 'DELETION' && existing.userId) {
    const hold = await db.legalHold.findFirst({ where: { userId: existing.userId, active: true } });
    if (hold) {
      await db.privacyRequest.update({ where: { id: requestId }, data: { status: 'ON_HOLD_LEGAL', legalHoldId: hold.id } });
      return NextResponse.json({ error: `Blocked by an active legal hold: "${hold.reason}".` }, { status: 409 });
    }
  }

  if (parsed.data.status === 'COMPLETED' && existing.type === 'DELETION' && existing.userId) {
    await anonymizeUserAccount(existing.userId, parsed.data.reason || 'DPDP deletion request');
  }

  await db.privacyRequest.update({
    where: { id: requestId },
    data: {
      status: parsed.data.status,
      handledById: admin.id,
      resolutionNote: parsed.data.reason,
      completedAt: parsed.data.status === 'COMPLETED' || parsed.data.status === 'REJECTED' ? new Date() : undefined,
    },
  });

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: `privacy.request.${parsed.data.status.toLowerCase()}`,
    category: 'privacy',
    targetType: 'PrivacyRequest',
    targetId: requestId,
    previousValue: { status: existing.status },
    newValue: { status: parsed.data.status },
    reason: parsed.data.reason,
    context: await getRequestContext(),
  });

  return NextResponse.json({ ok: true });
}
