import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';

const bodySchema = z.object({ body: z.string().trim().min(1).max(4000), internal: z.boolean().optional() });

export async function POST(req: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const guard = await requirePermission('support.respond');
  if ('error' in guard) return guard.error;
  const { admin } = guard;
  const { ticketId } = await params;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Enter a message.' }, { status: 400 });

  const ticket = await db.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  await db.$transaction([
    db.ticketMessage.create({
      data: { ticketId, authorType: 'admin', authorAdminId: admin.id, body: parsed.data.body, internal: parsed.data.internal ?? false },
    }),
    db.supportTicket.update({
      where: { id: ticketId },
      data: { status: ticket.status === 'OPEN' ? 'IN_PROGRESS' : ticket.status },
    }),
  ]);

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: parsed.data.internal ? 'support.ticket.note_added' : 'support.ticket.replied',
    category: 'support',
    targetType: 'SupportTicket',
    targetId: ticketId,
    context: await getRequestContext(),
  });

  return NextResponse.json({ ok: true });
}
