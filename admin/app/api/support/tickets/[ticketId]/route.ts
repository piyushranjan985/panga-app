import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';

const bodySchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_ON_USER', 'ESCALATED', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  assigneeId: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const guard = await requirePermission('support.assign');
  if ('error' in guard) return guard.error;
  const { admin } = guard;
  const { ticketId } = await params;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const existing = await db.supportTicket.findUnique({ where: { id: ticketId } });
  if (!existing) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.status === 'ESCALATED') data.escalatedAt = new Date();
  if (parsed.data.status === 'RESOLVED') data.resolvedAt = new Date();

  await db.supportTicket.update({ where: { id: ticketId }, data });

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'support.ticket.update',
    category: 'support',
    targetType: 'SupportTicket',
    targetId: ticketId,
    previousValue: { status: existing.status, priority: existing.priority, assigneeId: existing.assigneeId },
    newValue: parsed.data,
    context: await getRequestContext(),
  });

  return NextResponse.json({ ok: true });
}
