import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';

const bodySchema = z.object({
  assigneeId: z.string().nullable().optional(),
  status: z.enum(['OPEN', 'IN_REVIEW', 'ESCALATED']).optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const guard = await requirePermission('moderation.assign');
  if ('error' in guard) return guard.error;
  const { admin } = guard;
  const { caseId } = await params;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const existing = await db.moderationCase.findUnique({ where: { id: caseId } });
  if (!existing) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (parsed.data.assigneeId !== undefined) data.assigneeId = parsed.data.assigneeId;
  if (parsed.data.status) data.status = parsed.data.status;
  if (parsed.data.severity) data.severity = parsed.data.severity;

  await db.moderationCase.update({ where: { id: caseId }, data });

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'moderation.case.update',
    category: 'moderation',
    targetType: 'ModerationCase',
    targetId: caseId,
    previousValue: { assigneeId: existing.assigneeId, status: existing.status, severity: existing.severity },
    newValue: parsed.data,
    context: await getRequestContext(),
  });

  return NextResponse.json({ ok: true });
}
