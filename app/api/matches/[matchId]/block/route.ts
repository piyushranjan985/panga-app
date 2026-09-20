import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { assertParticipant, otherUserId } from '@/lib/matchAuthz';

// Blocking ends the match immediately and records a one-directional Block
// row so GET /api/discover excludes this person (in both directions)
// going forward -- see that route's `blocked` query. A Block row is
// enough on its own; there's no separate "was this person blocked"
// check anywhere else, since discovery eligibility is the only place
// blocking needs to change behavior.
export async function POST(_req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const match = await assertParticipant(matchId, session.userId);
  if (!match) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const otherId = otherUserId(match, session.userId);

  await db.$transaction([
    db.block.upsert({
      where: { blockerId_blockedId: { blockerId: session.userId, blockedId: otherId } },
      update: {},
      create: { blockerId: session.userId, blockedId: otherId },
    }),
    db.match.update({ where: { id: matchId }, data: { unmatchedAt: new Date() } }),
  ]);

  return NextResponse.json({ ok: true });
}
