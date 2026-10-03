import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { assertParticipant } from '@/lib/matchAuthz';
import { isPushCategoryEnabled, sendPushToUser } from '@/lib/notifications/push';

// The entire blind-reveal mechanic for Mystery Match -- see
// docs/MYSTERY_MATCH.md and prisma/schema.prisma's comment on
// Match.revealedAAt/revealedBAt. One-way: tapping Reveal sets the
// caller's own side's timestamp (if not already set) and NEVER un-sets
// it -- there's no "un-reveal". Not a toggle: this route only ever moves
// a null to now(), idempotently (tapping it twice is a no-op, not an
// error).
//
// Deliberately does NOT tell the caller whether the other side has
// revealed yet, beyond returning the shared `fullyRevealed` boolean --
// nothing here nudges one side with "they're waiting on you" framing
// that could pressure a reveal. The push notification below only fires
// the moment `fullyRevealed` flips from false to true (i.e. this tap was
// the second one), and goes to BOTH sides equally -- a one-sided reveal
// notifies no one, so revealing first never tips the other person off.
export async function POST(_req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const match = await assertParticipant(matchId, session.userId);
  if (!match) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (!match.isMysteryMatch) {
    return NextResponse.json({ error: 'not a Mystery Match' }, { status: 400 });
  }

  const isUserA = match.userAId === session.userId;
  const alreadyRevealedMine = isUserA ? Boolean(match.revealedAAt) : Boolean(match.revealedBAt);
  const otherRevealed = isUserA ? Boolean(match.revealedBAt) : Boolean(match.revealedAAt);

  const updated = alreadyRevealedMine
    ? match
    : await db.match.update({
        where: { id: match.id },
        data: isUserA ? { revealedAAt: new Date() } : { revealedBAt: new Date() },
      });

  const fullyRevealedNow = Boolean(updated.revealedAAt) && Boolean(updated.revealedBAt);
  const justBecameFullyRevealed = fullyRevealedNow && !alreadyRevealedMine && otherRevealed;

  if (justBecameFullyRevealed) {
    try {
      const [profileA, profileB, enabledA, enabledB] = await Promise.all([
        db.profile.findUnique({ where: { userId: match.userAId }, select: { displayName: true } }),
        db.profile.findUnique({ where: { userId: match.userBId }, select: { displayName: true } }),
        isPushCategoryEnabled(match.userAId, 'matchesMessages'),
        isPushCategoryEnabled(match.userBId, 'matchesMessages'),
      ]);
      await Promise.all([
        enabledA
          ? sendPushToUser(match.userAId, 'push.mystery_reveal', { name: profileB?.displayName ?? 'Someone' })
          : Promise.resolve(),
        enabledB
          ? sendPushToUser(match.userBId, 'push.mystery_reveal', { name: profileA?.displayName ?? 'Someone' })
          : Promise.resolve(),
      ]);
    } catch (err) {
      console.error('[push] mystery-reveal trigger failed', { matchId: match.id, err });
    }
  }

  return NextResponse.json({
    revealStatus: {
      isMysteryMatch: true,
      myRevealed: true,
      partnerRevealed: otherRevealed,
      fullyRevealed: fullyRevealedNow,
    },
  });
}
