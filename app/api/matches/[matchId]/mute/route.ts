import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { assertParticipant } from '@/lib/matchAuthz';

// "Mute" (⋯ safety menu) -- per-side toggle, symmetrical with Hide/Delete.
// This MVP has no push notifications yet, so today this only silences
// the in-app unread/"new message" treatment for the requesting user, not
// a real notification (see prisma/schema.prisma's mutedAAt/mutedBAt).
// Toggling: if already muted, this un-mutes; otherwise it mutes.
export async function POST(_req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const match = await assertParticipant(matchId, session.userId);
  if (!match) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const isUserA = match.userAId === session.userId;
  const currentlyMuted = isUserA ? Boolean(match.mutedAAt) : Boolean(match.mutedBAt);
  const nextValue = currentlyMuted ? null : new Date();

  await db.match.update({
    where: { id: matchId },
    data: isUserA ? { mutedAAt: nextValue } : { mutedBAt: nextValue },
  });

  return NextResponse.json({ ok: true, isMuted: !currentlyMuted });
}
