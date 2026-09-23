import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';

const bodySchema = z.object({
  outcome: z.enum(['UPHELD', 'OVERTURNED']),
  reason: z.string().trim().min(1).max(4000).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const guard = await requirePermission('moderation.appeals.review');
  if ('error' in guard) return guard.error;
  const { admin } = guard;
  const { caseId } = await params;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const appeal = await db.moderationAppeal.findFirst({ where: { caseId, status: 'PENDING' } });
  if (!appeal) return NextResponse.json({ error: 'No pending appeal on this case.' }, { status: 404 });

  await db.moderationAppeal.update({
    where: { id: appeal.id },
    data: { status: parsed.data.outcome, reviewedById: admin.id, reviewedAt: new Date(), reviewNote: parsed.data.reason },
  });

  // Overturning reopens the case for another look -- it doesn't
  // automatically reverse a User Action (unban, etc.); that stays a
  // separate, explicitly logged step on the Users page so the reversal
  // itself has its own audit trail.
  if (parsed.data.outcome === 'OVERTURNED') {
    await db.moderationCase.update({ where: { id: caseId }, data: { status: 'IN_REVIEW' } });
  }

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: `moderation.appeal.${parsed.data.outcome.toLowerCase()}`,
    category: 'moderation',
    targetType: 'ModerationAppeal',
    targetId: appeal.id,
    reason: parsed.data.reason,
    context: await getRequestContext(),
  });

  return NextResponse.json({ ok: true });
}
