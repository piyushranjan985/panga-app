import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { assertParticipant } from '@/lib/matchAuthz';

// A blunt, no-message unmatch -- distinct from the messages route's
// `noGhostClose` (which sends a polite farewell first). Both end up
// setting the same `unmatchedAt`; this is the plain "Unmatch" item in the
// chat screen's ... safety menu.
export async function POST(_req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const match = await assertParticipant(matchId, session.userId);
  if (!match) return NextResponse.json({ error: 'not found' }, { status: 404 });

  await db.match.update({ where: { id: matchId }, data: { unmatchedAt: new Date() } });

  return NextResponse.json({ ok: true });
}
