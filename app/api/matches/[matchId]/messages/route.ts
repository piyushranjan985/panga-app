import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

async function assertParticipant(matchId: string, userId: string) {
  const match = await db.match.findUnique({ where: { id: matchId } });
  if (!match || match.unmatchedAt) return null;
  if (match.userAId !== userId && match.userBId !== userId) return null;
  return match;
}

export async function GET(_req: Request, { params }: { params: { matchId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const match = await assertParticipant(params.matchId, session.userId);
  if (!match) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const messages = await db.message.findMany({
    where: { matchId: params.matchId },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ messages });
}

const NO_GHOST_CLOSE =
  "Hey — I've enjoyed chatting, but I don't think we're the right match. Wishing you a good one. 💛 (sent via Panga's No-Ghost close)";

const bodySchema = z.object({
  body: z.string().trim().min(1).max(1000).optional(),
  noGhostClose: z.boolean().optional(),
});

export async function POST(req: Request, { params }: { params: { matchId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const match = await assertParticipant(params.matchId, session.userId);
  if (!match) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid message' }, { status: 400 });

  const body = parsed.data.noGhostClose ? NO_GHOST_CLOSE : parsed.data.body;
  if (!body) return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 });

  const message = await db.message.create({
    data: { matchId: params.matchId, senderId: session.userId, body },
  });

  if (parsed.data.noGhostClose) {
    await db.match.update({ where: { id: params.matchId }, data: { unmatchedAt: new Date() } });
  }

  return NextResponse.json({ ok: true, message });
}
