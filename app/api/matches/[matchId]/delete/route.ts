import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { assertParticipant } from '@/lib/matchAuthz';

// "Delete conversation" (⋯ safety menu) -- reuses the exact same
// per-side hiddenAAt/hiddenBAt mechanism as "Hide conversation": this
// MVP has no separate message-purge story, so "delete" is presented as
// a more final-sounding, confirm-gated version of the same "remove from
// just my matches list" action, not an actual data-destroying operation.
// See app/api/matches/[matchId]/hide/route.ts, which this mirrors.
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
