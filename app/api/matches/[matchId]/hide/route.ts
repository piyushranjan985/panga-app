import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { assertParticipant } from '@/lib/matchAuthz';

// "Hide conversation" -- removes this match from just the requesting
// user's own matches list (see GET /api/matches' filter), without
// unmatching or notifying the other person. Match doesn't have a
// per-viewer row to hang a single flag off, so this is one nullable
// timestamp per side (see prisma/schema.prisma's hiddenAAt/hiddenBAt).
export async function POST(_req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const match = await assertParticipant(matchId, session.userId);
  if (!match) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const isUserA = match.userAId === session.userId;
  await db.match.update({
    where: { id: matchId },
    data: isUserA ? { hiddenAAt: new Date() } : { hiddenBAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
