import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { checkAccountActive } from '@/lib/accountEnforcement';
import { getEntitlements, isFeatureLocked } from '@/lib/payments/entitlements';

/**
 * POST /api/swipe/rewind -- `rewind_last_swipe` (lib/payments/types.ts's
 * FeatureKey). Undoes the caller's single most recent swipe (PASS or
 * VYBE), so it's shown again in their feed. Deliberately never lets a
 * swipe that already formed a Match be undone this way -- the Swipe row
 * backing a real match has downstream consequences (chat history, a
 * Vybe Vouch invite, etc.) that "undo my last tap" was never meant to
 * unwind; a real mutual match can only be ended through the match's own
 * unmatch flow (app/api/matches/[matchId]/unmatch/route.ts).
 */
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const enforcement = await checkAccountActive(session.userId);
  if (enforcement.blocked) return NextResponse.json({ error: enforcement.reason }, { status: 403 });

  const entitlements = await getEntitlements(session.userId);
  if (isFeatureLocked(entitlements, 'rewind_last_swipe')) {
    return NextResponse.json(
      { error: 'Rewind is part of a paid plan. Upgrade to undo your last swipe.', code: 'UPGRADE_REQUIRED', feature: 'rewind_last_swipe' },
      { status: 403 },
    );
  }

  const lastSwipe = await db.swipe.findFirst({
    where: { fromUserId: session.userId },
    orderBy: { createdAt: 'desc' },
  });
  if (!lastSwipe) {
    return NextResponse.json({ error: 'Nothing to rewind yet.' }, { status: 404 });
  }

  // A mutual match already exists for this pair -- never silently delete
  // the swipe that formed it (see the file comment above). Checked both
  // orderings since Match's unique key is an ordered [userAId, userBId]
  // pair, same convention as app/api/swipe/route.ts's orderedPair.
  const [userAId, userBId] =
    session.userId < lastSwipe.toUserId ? [session.userId, lastSwipe.toUserId] : [lastSwipe.toUserId, session.userId];
  const existingMatch = await db.match.findUnique({ where: { userAId_userBId: { userAId, userBId } } });
  if (existingMatch && !existingMatch.unmatchedAt) {
    return NextResponse.json(
      { error: "You've already matched with this person -- unmatch from the chat screen instead." },
      { status: 409 },
    );
  }

  await db.swipe.delete({ where: { id: lastSwipe.id } });

  return NextResponse.json({ ok: true, userId: lastSwipe.toUserId, action: lastSwipe.action });
}
