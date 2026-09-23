import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { rankCandidates, type MatchableProfile } from '@/lib/matching';
import { distanceLabel } from '@/lib/geo';
import { checkAccountActive } from '@/lib/accountEnforcement';

const FEED_SIZE = 15;

function toMatchable(p: {
  userId: string;
  gender: string;
  lookingFor: string[];
  city: string;
  intent: string;
  quietMode: boolean;
  interests: { id: string }[];
  user: { lastActiveAt: Date };
}): MatchableProfile {
  return {
    userId: p.userId,
    gender: p.gender as MatchableProfile['gender'],
    lookingFor: p.lookingFor as MatchableProfile['gender'][],
    city: p.city,
    intent: p.intent as MatchableProfile['intent'],
    quietMode: p.quietMode,
    interestIds: p.interests.map((i) => i.id),
    lastActiveAt: p.user.lastActiveAt,
  };
}

/**
 * GET /api/discover — returns a ranked feed of eligible profiles for the
 * signed-in user. Query and rank layers are kept separate on purpose: this
 * route fetches a candidate pool with Prisma and hands plain objects to
 * lib/matching.ts, which owns every rule about who sees whom.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const enforcement = await checkAccountActive(session.userId);
  if (enforcement.blocked) return NextResponse.json({ error: enforcement.reason }, { status: 403 });

  const viewerProfile = await db.profile.findUnique({
    where: { userId: session.userId },
    include: { interests: true, user: { select: { lastActiveAt: true } } },
  });
  // Distance is purely a display signal, computed independently of the
  // ranking/eligibility layer above (see lib/geo.ts) -- omitted from the
  // feed entirely for any pair where either side hasn't opted into
  // sharing location, rather than showing a placeholder.
  if (!viewerProfile) {
    return NextResponse.json({ error: 'Finish onboarding first' }, { status: 409 });
  }

  const [alreadySwiped, blockedByMe, blockedMe, candidatePool] = await Promise.all([
    db.swipe.findMany({ where: { fromUserId: session.userId }, select: { toUserId: true } }),
    db.block.findMany({ where: { blockerId: session.userId }, select: { blockedId: true } }),
    db.block.findMany({ where: { blockedId: session.userId }, select: { blockerId: true } }),
    // MVP-scale candidate pool: everyone else with a profile. At real scale
    // this becomes a geo-indexed query — pulling "everyone" is fine below a
    // few thousand users, not beyond it.
    db.profile.findMany({
      // Trust & Safety enforcement -- a discoveryRestricted or
      // profileHidden profile, or a non-ACTIVE account, never appears in
      // anyone else's feed (see lib/accountEnforcement.ts).
      where: {
        userId: { not: session.userId },
        discoveryRestricted: false,
        profileHidden: false,
        user: { status: 'ACTIVE' },
      },
      include: {
        interests: true,
        user: { select: { lastActiveAt: true } },
        answers: { include: { prompt: true }, take: 3 },
        photos: { where: { removedAt: null }, orderBy: { position: 'asc' }, take: 1 },
      },
      // latitude/longitude/locationUpdatedAt come along for free (no
      // `select` narrowing on this query) -- distanceLabel above reads
      // them straight off each candidate row.
      take: 500,
    }),
  ]);

  // Blocking (see app/api/matches/[matchId]/block/route.ts) excludes both
  // directions from discovery from then on, same as an already-swiped-on
  // profile -- one combined exclusion set.
  const excluded = new Set([
    ...alreadySwiped.map((s) => s.toUserId),
    ...blockedByMe.map((b) => b.blockedId),
    ...blockedMe.map((b) => b.blockerId),
  ]);
  const viewer = toMatchable({ ...viewerProfile, userId: viewerProfile.userId });
  const candidates = candidatePool.map((c) => toMatchable({ ...c, userId: c.userId }));

  const ranked = rankCandidates(viewer, candidates, excluded).slice(0, FEED_SIZE);

  const byId = new Map(candidatePool.map((c) => [c.userId, c]));
  const feed = ranked.map((r) => {
    const p = byId.get(r.userId)!;
    return {
      userId: p.userId,
      displayName: p.displayName,
      city: p.city,
      intent: p.intent,
      bio: p.bio,
      avatarSeed: p.avatarSeed,
      avatarHue: p.avatarHue,
      photoUrl: p.photos[0]?.url ?? null,
      verification: p.verification,
      interests: p.interests.map((i) => ({ id: i.id, label: i.label, emoji: i.emoji, tagline: i.tagline })),
      prompts: p.answers.map((a) => ({ id: a.promptId, text: a.prompt.text, emoji: a.prompt.emoji, answer: a.answer })),
      matchScore: r.score,
      matchReasons: r.reasons,
      distance: distanceLabel(viewerProfile, p),
    };
  });

  return NextResponse.json({ feed });
}
