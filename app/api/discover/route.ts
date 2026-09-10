import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { rankCandidates, type MatchableProfile } from '@/lib/matching';

const FEED_SIZE = 15;

function toMatchable(p: {
  userId: string;
  gender: string;
  lookingFor: string[];
  city: string;
  intent: string;
  quietMode: boolean;
  circles: { circleId: string }[];
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
    circleIds: p.circles.map((c) => c.circleId),
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

  const viewerProfile = await db.profile.findUnique({
    where: { userId: session.userId },
    include: { circles: true, interests: true, user: { select: { lastActiveAt: true } } },
  });
  if (!viewerProfile) {
    return NextResponse.json({ error: 'Finish onboarding first' }, { status: 409 });
  }

  const [alreadySwiped, candidatePool] = await Promise.all([
    db.swipe.findMany({ where: { fromUserId: session.userId }, select: { toUserId: true } }),
    // MVP-scale candidate pool: everyone else with a profile. At real scale
    // this becomes a geo + circle-indexed query (see scaling section) —
    // pulling "everyone" is fine below a few thousand users, not beyond it.
    db.profile.findMany({
      where: { userId: { not: session.userId } },
      include: {
        circles: true,
        interests: true,
        user: { select: { lastActiveAt: true } },
        answers: { include: { prompt: true }, take: 3 },
      },
      take: 500,
    }),
  ]);

  const excluded = new Set(alreadySwiped.map((s) => s.toUserId));
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
      verification: p.verification,
      interests: p.interests.map((i) => ({ id: i.id, label: i.label, emoji: i.emoji })),
      prompts: p.answers.map((a) => ({ id: a.promptId, text: a.prompt.text, emoji: a.prompt.emoji, answer: a.answer })),
      matchScore: r.score,
      matchReasons: r.reasons,
    };
  });

  return NextResponse.json({ feed });
}
