import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';

const bodySchema = z.object({
  status: z.enum(['DETECTED', 'ASSESSING', 'CONTAINED', 'BOARD_NOTIFIED', 'USERS_NOTIFIED', 'CLOSED']).optional(),
  rootCause: z.string().trim().max(5000).optional(),
  remediation: z.string().trim().max(5000).optional(),
  reason: z.string().trim().max(2000).optional(),
});

// Transitions an incident's status (and/or records root cause /
// remediation) as one call, always with a note appended to its timeline
// so the sequence of events is reconstructable later -- the whole point
// of PrivacyIncidentEvent. BOARD_NOTIFIED / USERS_NOTIFIED stamp their own
// timestamp fields, since those specific dates matter for DPDP breach
// notification timelines.
export async function PATCH(req: Request, { params }: { params: Promise<{ incidentId: string }> }) {
  const guard = await requirePermission('privacy.incidents.manage');
  if ('error' in guard) return guard.error;
  const { admin } = guard;
  const { incidentId } = await params;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const existing = await db.privacyIncident.findUnique({ where: { id: incidentId } });
  if (!existing) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (parsed.data.status) {
    data.status = parsed.data.status;
    if (parsed.data.status === 'CONTAINED') data.containedAt = new Date();
    if (parsed.data.status === 'BOARD_NOTIFIED') data.boardNotifiedAt = new Date();
    if (parsed.data.status === 'USERS_NOTIFIED') data.usersNotifiedAt = new Date();
  }
  if (parsed.data.rootCause !== undefined) data.rootCause = parsed.data.rootCause;
  if (parsed.data.remediation !== undefined) data.remediation = parsed.data.remediation;

  await db.privacyIncident.update({
    where: { id: incidentId },
    data: {
      ...data,
      timeline: {
        create: {
          note: parsed.data.reason || (parsed.data.status ? `Status changed to ${parsed.data.status}.` : 'Incident updated.'),
          authorId: admin.id,
        },
      },
    },
  });

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: parsed.data.status ? `privacy.incident.status.${parsed.data.status.toLowerCase()}` : 'privacy.incident.update',
    category: 'privacy',
    targetType: 'PrivacyIncident',
    targetId: incidentId,
    previousValue: { status: existing.status },
    newValue: data,
    reason: parsed.data.reason,
    context: await getRequestContext(),
  });

  return NextResponse.json({ ok: true });
}
