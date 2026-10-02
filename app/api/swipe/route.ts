import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { checkAccountActive } from '@/lib/accountEnforcement';
import { isPushCategoryEnabled, sendPushToUser } from '@/lib/notifications/push';

const bodySchema = z.object({
  toUserId: z.string(),
  action: z.enum(['PASS', 'VYBE']),
});

// Deterministic ordering for the Match row's unique [userAId, userBId] pair
// so "A matches B" and "B matches A" never create two rows.
function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const enforcement = await checkAccountActive(session.userId);
  if (enforcement.blocked) return NextResponse.json({ error: enforcement.reason }, { status: 403 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid swipe' }, { status: 400 });
  const { toUserId, action } = parsed.data;

  if (toUserId === session.userId) {
    return NextResponse.json({ error: "You can't swipe on yourself" }, { status: 400 });
  }

  await db.swipe.upsert({
    where: { fromUserId_toUserId: { fromUserId: session.userId, toUserId } },
    update: { action },
    create: { fromUserId: session.userId, toUserId, action },
  });

  let matched = false;
  let matchId: string | null = null;

  if (action === 'VYBE') {
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
      // Awaited, not fire-and-forget (see the messages route's new-message
      // trigger for why); sendPushToUser() never throws, so a missing
      // Firebase setup can't fail the swipe/match itself.
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
    }
  }

  return NextResponse.json({ ok: true, matched, matchId });
}
