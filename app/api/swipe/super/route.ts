import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { checkAccountActive } from '@/lib/accountEnforcement';
import { isPushCategoryEnabled, sendPushToUser } from '@/lib/notifications/push';
import { getSwipeDailyLimit, evaluateSwipeCount } from '@/lib/swipeRateLimit';
import { spendCredits } from '@/lib/payments/entitlements';
import { CREDIT_FEATURE_COSTS } from '@/lib/payments/types';

const bodySchema = z.object({ toUserId: z.string() });

// Deterministic ordering for the Match row's unique [userAId, userBId] pair
// so "A matches B" and "B matches A" never create two rows. Same helper as
// app/api/swipe/route.ts; kept duplicated rather than imported since
// that route doesn't export it and this is the only other call site.
function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/**
 * POST /api/swipe/super -- "Super Vybe" (lib/payments/types.ts's
 * CreditFeatureKey.super_like). Same swipe/match mechanics as POST
 * /api/swipe (same upsert, same mutual-match check, same new-match
 * push) with exactly two differences: it always sends a VYBE (there's
 * no "super pass"), and it costs CREDIT_FEATURE_COSTS.super_like
 * credits, spent BEFORE the swipe is recorded so a failed spend never
 * leaves a half-done swipe behind.
 *
 * Deliberately NOT subject to lib/payments/swipeCap.ts's unlimited_swipes
 * cap -- that cap exists to push a free user toward a subscription;
 * someone spending a credit on this exact swipe has already paid for
 * it. It IS still subject to the ordinary abuse-prevention daily cap
 * below (lib/swipeRateLimit.ts) -- it's still one more row in the Swipe
 * table either way.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const enforcement = await checkAccountActive(session.userId);
  if (enforcement.blocked) return NextResponse.json({ error: enforcement.reason }, { status: 403 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const { toUserId } = parsed.data;

  if (toUserId === session.userId) {
    return NextResponse.json({ error: "You can't swipe on yourself" }, { status: 400 });
  }

  const dailyLimit = getSwipeDailyLimit();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const countLast24h = await db.swipe.count({ where: { fromUserId: session.userId, createdAt: { gte: dayAgo } } });
  if (!evaluateSwipeCount(dailyLimit, countLast24h).ok) {
    return NextResponse.json(
      { error: `You've hit today's swipe limit (${dailyLimit}). More will unlock in a bit -- come back soon!` },
      { status: 429 },
    );
  }

  const cost = CREDIT_FEATURE_COSTS.super_like;
  const spent = await spendCredits(session.userId, cost, 'feature_redeem:super_like');
  if (!spent) {
    return NextResponse.json(
      {
        error: `Super Vybe costs ${cost} credit${cost === 1 ? '' : 's'}. Buy a credit pack to use it.`,
        code: 'INSUFFICIENT_CREDITS',
      },
      { status: 402 },
    );
  }

  await db.swipe.upsert({
    where: { fromUserId_toUserId: { fromUserId: session.userId, toUserId } },
    update: { action: 'VYBE', isSuperLike: true },
    create: { fromUserId: session.userId, toUserId, action: 'VYBE', isSuperLike: true },
  });

  let matched = false;
  let matchId: string | null = null;

  const reciprocal = await db.swipe.findUnique({
    where: { fromUserId_toUserId: { fromUserId: toUserId, toUserId: session.userId } },
  });

  if (reciprocal?.action === 'VYBE') {
    const [userAId, userBId] = orderedPair(session.userId, toUserId);
    const match = await db.match.upsert({
      where: { userAId_userBId: { userAId, userBId } },
      update: {},
      create: { userAId, userBId },
    });
    matched = true;
    matchId = match.id;

    // New-match push to both sides -- see docs/PUSH_NOTIFICATIONS.md §4.
    try {
      const [meProfile, otherProfile] = await Promise.all([
        db.profile.findUnique({ where: { userId: session.userId }, select: { displayName: true } }),
        db.profile.findUnique({ where: { userId: toUserId }, select: { displayName: true } }),
      ]);
      const [meEnabled, otherEnabled] = await Promise.all([
        isPushCategoryEnabled(session.userId, 'matchesMessages'),
        isPushCategoryEnabled(toUserId, 'matchesMessages'),
      ]);
      await Promise.all([
        meEnabled
          ? sendPushToUser(session.userId, 'push.match', { name: otherProfile?.displayName ?? 'Someone' })
          : Promise.resolve(),
        otherEnabled
          ? sendPushToUser(toUserId, 'push.match', { name: meProfile?.displayName ?? 'Someone' })
          : Promise.resolve(),
      ]);
    } catch (err) {
      console.error('[push] new-match trigger failed', err);
    }
  } else {
    // Not a mutual match (yet) -- let the recipient know right away that
    // someone Super Vybe'd them. Reuses the 'matchesMessages' toggle --
    // there's no dedicated notification category for this one action
    // (see lib/notifications/push.ts's PushCategory), and adding one is
    // a bigger, user-facing Notification-settings change this pass
    // doesn't need to make.
    try {
      if (await isPushCategoryEnabled(toUserId, 'matchesMessages')) {
        const meProfile = await db.profile.findUnique({ where: { userId: session.userId }, select: { displayName: true } });
        await sendPushToUser(toUserId, 'push.super_like', { name: meProfile?.displayName ?? 'Someone' });
      }
    } catch (err) {
      console.error('[push] super-like trigger failed', err);
    }
  }

  return NextResponse.json({ ok: true, matched, matchId });
}
