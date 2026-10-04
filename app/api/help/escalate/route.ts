import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

const bodySchema = z.object({
  note: z.string().trim().min(1).max(2000),
  transcript: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string() }))
    .max(50)
    .optional(),
});

/**
 * "Talk to a human" from the VybeHelp 💬 widget (components/VybeHelp.tsx).
 * Both apps share one Prisma schema/database (see admin/prisma.config.ts),
 * so this just writes a SupportTicket directly -- no cross-app HTTP call,
 * no shared-secret to manage, and the admin Support Centre picks it up
 * immediately via the same table.
 *
 * SUPPORT_TICKET_SLA_HOURS: a 48-hour default due-by, set here at
 * creation time. Previously slaDueAt was only ever set by
 * admin/scripts/seed-admin.ts's demo data -- a real ticket created
 * through this route had slaDueAt: null, so the admin portal's
 * SLA-breach signal (admin/lib/liveSignals.ts) never actually fired for
 * a real ticket. This is the only place a SupportTicket is created today.
 */
const SUPPORT_TICKET_SLA_HOURS = 48;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Enter a short note about what you need help with.' }, { status: 400 });

  const user = await db.user.findUnique({ where: { id: session.userId }, select: { email: true, phone: true } });

  const ticket = await db.supportTicket.create({
    data: {
      userId: session.userId,
      contactEmail: user?.email,
      contactPhone: user?.phone,
      subject: parsed.data.note.slice(0, 120),
      category: 'other',
      channel: 'VYBEHELP_ESCALATION',
      status: 'OPEN',
      slaDueAt: new Date(Date.now() + SUPPORT_TICKET_SLA_HOURS * 3600 * 1000),
      vybeHelpTranscript: parsed.data.transcript ?? [],
      messages: {
        create: { authorType: 'user', body: parsed.data.note },
      },
    },
  });

  return NextResponse.json({ ok: true, ticketId: ticket.id });
}
