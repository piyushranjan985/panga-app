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
 */
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
      vybeHelpTranscript: parsed.data.transcript ?? [],
      messages: {
        create: { authorType: 'user', body: parsed.data.note },
      },
    },
  });

  return NextResponse.json({ ok: true, ticketId: ticket.id });
}
