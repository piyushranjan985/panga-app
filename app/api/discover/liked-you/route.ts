import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { checkAccountActive } from '@/lib/accountEnforcement';
import { getEntitlements, isFeatureLocked } from '@/lib/payments/entitlements';

// Generous padding over the final page size -- some incoming VYBEs get
// filtered out below (already decided, blocked), so querying a little
// deeper than LIKED_YOU_LIMIT keeps the final list from coming up short
// without needing a second round-trip.
const LIKED_YOU_LIMIT = 50;
const LIKED_YOU_QUERY_PAD = LIKED_YOU_LIMIT * 2;

/**
 * GET /api/discover/liked-you -- `see_who_liked_you` (lib/payments/
 * types.ts's FeatureKey). "Liked you" = someone else's incoming VYBE
 * that hasn't become a mutual Match yet and that the caller hasn't
 * already decided on (swiped PASS or VYBE back -- a mutual VYBE is
 * already surfaced as a Match, not here).
 *
 * Always returns a real `count` (even for a locked caller) so the
 * Discover page can show "12 people liked you" as the upgrade nudge --
 * only the actual profile list is gated behind the feature.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const enforcement = await checkAccountActive(session.userId);
  if (enforcement.blocked) return NextResponse.json({ error: enforcement.reason }, { status: 403 });

  const [blockedByMe, blockedMe, mySwipes, incoming] = await Promise.all([
    db.block.findMany({ where: { blockerId: session.userId }, select: { blockedId: true } }),
    db.block.findMany({ where: { blockedId: session.userId }, select: { blockerId: true } }),
    // Anyone I've already swiped on (PASS or VYBE) is already decided --
    // a mutual VYBE is already a Match (handled on the Matches screen,
    // not here); a PASS means I don't want them resurfaced as a prompt.
    db.swipe.findMany({ where: { fromUserId: session.userId }, select: { toUserId: true } }),
    db.swipe.findMany({
      where: { toUserId: session.userId, action: 'VYBE' },
      orderBy: { createdAt: 'desc' },
      take: LIKED_YOU_QUERY_PAD,
      select: { fromUserId: true, isSuperLike: true, createdAt: true },
    }),
  ]);

  const excluded = new Set([
    ...mySwipes.map((s) => s.toUserId),
    ...blockedByMe.map((b) => b.blockedId),
    ...blockedMe.map((b) => b.blockerId),
  ]);

  const pending = incoming.filter((s) => !excluded.has(s.fromUserId)).slice(0, LIKED_YOU_LIMIT);

  const entitlements = await getEntitlements(session.userId);
  if (isFeatureLocked(entitlements, 'see_who_liked_you')) {
    return NextResponse.json({ locked: true, count: pending.length, likers: [] });
  }

  const profiles = pending.length
    ? await db.profile.findMany({
        where: {
          userId: { in: pending.map((p) => p.fromUserId) },
          // Same visibility rules as the ordinary feed (see
          // lib/discoverPool.ts's queryEligiblePool) -- a liker whose
          // account is suspended, discovery-restricted, or who's hidden
          // their own profile since swiping shouldn't be surfaced here.
          user: { status: 'ACTIVE', discoveryRestricted: false, profileHidden: false },
        },
        select: {
          userId: true,
          displayName: true,
          city: true,
          avatarSeed: true,
          avatarHue: true,
          photos: { where: { removedAt: null, moderationStatus: 'APPROVED' }, orderBy: { position: 'asc' }, take: 1 },
        },
      })
    : [];
  const byId = new Map(profiles.map((p) => [p.userId, p]));

  const likers = pending
    .map((s) => {
      const p = byId.get(s.fromUserId);
      if (!p) return null;
      return {
        userId: p.userId,
        displayName: p.displayName,
        city: p.city,
        avatarSeed: p.avatarSeed,
        avatarHue: p.avatarHue,
        photoUrl: p.photos[0]?.url ?? null,
        isSuperLike: s.isSuperLike,
        likedAt: s.createdAt.toISOString(),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return NextResponse.json({ locked: false, count: likers.length, likers });
}
