import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isPushCategoryEnabled, sendPushToUser } from '@/lib/notifications/push';
import { matchMysteryPool, nextRotationCategory, type MysteryCandidate, type MysteryCategory } from '@/lib/mysteryMatch';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Mystery Match runs on India time regardless of where Vercel's cron
// clock or this function's region happens to be -- see
// docs/MYSTERY_MATCH.md. India has no DST, so this fixed +5:30 offset
// never drifts; vercel.json's schedule ("30 14 * * *") is this same
// 8:00pm IST expressed in UTC for the cron trigger itself.
const IST_OFFSET_MS = 5.5 * 60 * 60_000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60_000;

/** Start of "today" in IST, as a real UTC Date (safe to compare against any stored DateTime). */
function startOfTodayIST(now: Date): Date {
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const istMidnight = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()));
  return new Date(istMidnight.getTime() - IST_OFFSET_MS);
}

function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

const CATEGORIES: MysteryCategory[] = ['MYSTERY_MATCH', 'VYBE_FLIP', 'NO_LABELS'];

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured; refusing to run unauthenticated.' }, { status: 500 });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const todayStartIST = startOfTodayIST(now);

  // --- Step 1: auto-rotate selections nobody has touched in 7 days -------
  // Never touches OPTED_OUT in either direction (the where clause excludes
  // it, and nextRotationCategory() only cycles the other 3) -- see
  // docs/MYSTERY_MATCH.md's consent note on why opting out is sticky.
  const stale = await db.profile.findMany({
    where: {
      mysteryCategory: { not: 'OPTED_OUT' },
      mysteryCategorySetAt: { lte: new Date(now.getTime() - SEVEN_DAYS_MS) },
    },
    select: { userId: true, mysteryCategory: true },
  });
  await Promise.all(
    stale.map((p) =>
      db.profile.update({
        where: { userId: p.userId },
        data: { mysteryCategory: nextRotationCategory(p.mysteryCategory as MysteryCategory), mysteryCategorySetAt: now },
      }),
    ),
  );

  // --- Step 2: exclusions that apply everywhere, regardless of category --
  // Prior Mystery Match history (any category, ever), existing/past
  // Match, Swipe in either direction, Block in either direction -- the
  // same "never show this pair to each other again" promise as
  // app/api/discover/route.ts's exclusion set, extended with Mystery
  // Match's own history so nobody is ever reintroduced via this feature
  // either. One global set keyed by pairKey-style "a:b" (a < b), since
  // matchMysteryPool() expects exactly that.
  const [history, matches, swipes, blocks] = await Promise.all([
    db.mysteryMatchHistory.findMany({ select: { userAId: true, userBId: true } }),
    db.match.findMany({ select: { userAId: true, userBId: true } }),
    db.swipe.findMany({ select: { fromUserId: true, toUserId: true } }),
    db.block.findMany({ select: { blockerId: true, blockedId: true } }),
  ]);
  const excludePairs = new Set<string>();
  const addPair = (a: string, b: string) => {
    const [x, y] = orderedPair(a, b);
    excludePairs.add(`${x}:${y}`);
  };
  for (const h of history) addPair(h.userAId, h.userBId);
  for (const m of matches) addPair(m.userAId, m.userBId);
  for (const s of swipes) addPair(s.fromUserId, s.toUserId);
  for (const b of blocks) addPair(b.blockerId, b.blockedId);

  // --- Step 3: build each category's pool and run the pairing ------------
  // Same account-health filters app/api/discover/route.ts's candidate
  // pool uses (ACTIVE, not discovery-restricted, not profile-hidden,
  // quietMode off) -- Mystery Match is still discovery, just a
  // deliberately different pool/algorithm, so it inherits the same
  // trust-and-safety floor, not a looser one.
  const profiles = await db.profile.findMany({
    where: {
      quietMode: false,
      mysteryCategory: { not: 'OPTED_OUT' },
      user: { status: 'ACTIVE', discoveryRestricted: false, profileHidden: false },
    },
    select: {
      userId: true,
      gender: true,
      lookingFor: true,
      city: true,
      intent: true,
      mysteryCategory: true,
      interests: { select: { id: true } },
      tribes: { select: { id: true } },
      user: { select: { lastActiveAt: true } },
    },
  });

  const toCandidate = (p: (typeof profiles)[number]): MysteryCandidate => ({
    userId: p.userId,
    gender: p.gender as MysteryCandidate['gender'],
    lookingFor: p.lookingFor as MysteryCandidate['gender'][],
    city: p.city,
    intent: p.intent as MysteryCandidate['intent'],
    interestIds: p.interests.map((i) => i.id),
    tribeIds: p.tribes.map((t) => t.id),
    lastActiveAt: p.user.lastActiveAt,
  });

  let totalPairs = 0;
  let notified = 0;

  for (const category of CATEGORIES) {
    const pool = profiles.filter((p) => p.mysteryCategory === category).map(toCandidate);
    if (pool.length < 2) continue;

    const pairs = matchMysteryPool(category, pool, excludePairs, now);
    totalPairs += pairs.length;

    for (const { userIdA, userIdB } of pairs) {
      const [userAId, userBId] = orderedPair(userIdA, userIdB);

      // Keep every future day's pool honest about this pair immediately --
      // recorded even if the push below fails, so a notification hiccup
      // can never cause the same two people to be re-paired tomorrow.
      const match = await db.match.upsert({
        where: { userAId_userBId: { userAId, userBId } },
        update: {},
        create: { userAId, userBId, isMysteryMatch: true, mysteryCategory: category },
      });
      await db.mysteryMatchHistory.upsert({
        where: { userAId_userBId: { userAId, userBId } },
        update: {},
        create: { userAId, userBId, category, matchId: match.id },
      });

      try {
        const [profileA, profileB, enabledA, enabledB] = await Promise.all([
          db.profile.findUnique({ where: { userId: userAId }, select: { displayName: true } }),
          db.profile.findUnique({ where: { userId: userBId }, select: { displayName: true } }),
          isPushCategoryEnabled(userAId, 'matchesMessages'),
          isPushCategoryEnabled(userBId, 'matchesMessages'),
        ]);
        await Promise.all([
          enabledA
            ? sendPushToUser(userAId, 'push.mystery_match', { name: profileB?.displayName ?? 'Someone' })
            : Promise.resolve(),
          enabledB
            ? sendPushToUser(userBId, 'push.mystery_match', { name: profileA?.displayName ?? 'Someone' })
            : Promise.resolve(),
        ]);
        notified += (enabledA ? 1 : 0) + (enabledB ? 1 : 0);
      } catch (err) {
        console.error('[push] mystery-match trigger failed', { userAId, userBId, category, err });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    rotated: stale.length,
    poolSize: profiles.length,
    totalPairs,
    notified,
    todayStartIST,
  });
}
