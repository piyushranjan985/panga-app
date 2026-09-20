import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { assertParticipant } from '@/lib/matchAuthz';

// Toggle a "like" (heart) on a single message -- see
// prisma/schema.prisma's MessageLike. Either participant can like any
// message in their own match, including their own (same as most chat
// apps); toggling just adds/removes this user's own MessageLike row.
export async function POST(_req: Request, { params }: { params: Promise<{ matchId: string; messageId: string }> }) {
  const { matchId, messageId } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const match = await assertParticipant(matchId, session.userId);
  if (!match) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const message = await db.message.findUnique({ where: { id: messageId } });
  if (!message || message.matchId !== matchId) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const existing = await db.messageLike.findUnique({
    where: { messageId_userId: { messageId, userId: session.userId } },
  });

  if (existing) {
    await db.messageLike.delete({ where: { id: existing.id } });
  } else {
    await db.messageLike.create({ data: { messageId, userId: session.userId } });
  }

  const likes = await db.messageLike.findMany({ where: { messageId }, select: { userId: true } });
  return NextResponse.json({ ok: true, liked: !existing, likes });
}
