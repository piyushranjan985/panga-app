import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';

const bodySchema = z.object({
  outcome: z.enum(['RESOLVED', 'DISMISSED']),
  reason: z.string().trim().min(1).max(4000).optional(),
});

// "Resolve" and "Dismiss" both close the case; AI recommendations never
// call this automatically (spec: "AI recommendations must never
// automatically perform irreversible enforcement without the configured
// approval policy") -- a human admin always makes this call, which is why
// this route only exists behind moderation.resolve and a typed reason via
// ConfirmActionButton, never a background job.
export async function POST(req: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const guard = await requirePermission('moderation.resolve');
  if ('error' in guard) return guard.error;
  const { admin } = guard;
  const { caseId } = await params;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const existing = await db.moderationCase.findUnique({ where: { id: caseId } });
  if (!existing) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  await db.moderationCase.update({
    where: { id: caseId },
    data: {
      status: parsed.data.outcome,
      resolution: parsed.data.reason,
      resolvedAt: new Date(),
      resolvedById: admin.id,
    },
  });

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: `moderation.case.${parsed.data.outcome.toLowerCase()}`,
    category: 'moderation',
    targetType: 'ModerationCase',
    targetId: caseId,
    previousValue: { status: existing.status },
    newValue: { status: parsed.data.outcome },
    reason: parsed.data.reason,
    context: await getRequestContext(),
  });

  return NextResponse.json({ ok: true });
}
