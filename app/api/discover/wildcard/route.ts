import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { rankWildCardCandidates } from '@/lib/matching';
import { distanceLabel } from '@/lib/geo';
import { checkAccountActive } from '@/lib/accountEnforcement';
import { getCityCandidatePool, toMatchable } from '@/lib/discoverPool';
import { wildCardQuota, todaysWildCardCandidateIds } from '@/lib/wildCard';

/**
 * GET /api/discover/wildcard -- one on-demand Wild Card pick (see
 * docs/WILD_CARD.md), live inside normal Discover rather than a separate
 * scheduled batch (that's Mystery Match's shape, not this one). Returns a
 * single card, shaped exactly like a normal /api/discover feed item plus
 * `isWildCard: true`, or a 404 when nothing eligible is left today.
 *
 * Deliberately a GET with a side effect (writes a WildCardUse row on
 * every successful pick) -- same non-RESTful shape /api/discover's
 * sibling routes already use when "fetching" and "spending something"
 * are the same action from the user's point of view; see the quota note
 * in lib/wildCard.ts for why an empty-pool miss does NOT write a row.
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
  if (!viewerProfile) {
    return NextResponse.json({ error: 'Finish onboarding first' }, { status: 409 });
  }

  const now = new Date();
  const quota = await wildCardQuota(session.userId, now);
  if (quota.remaining <= 0) {
    return NextResponse.json({ error: 'No Wild Cards left today', remaining: 0, limit: quota.limit }, { status: 403 });
  }

  const [alreadySwiped, blockedByMe, blockedMe, usedToday, candidatePool] = await Promise.all([
    db.swipe.findMany({ where: { fromUserId: session.userId }, select: { toUserId: true } }),
    db.block.findMany({ where: { blockerId: session.userId }, select: { blockedId: true } }),
    db.block.findMany({ where: { blockedId: session.userId }, select: { blockerId: true } }),
    todaysWildCardCandidateIds(session.userId, now),
    getCityCandidatePool(viewerProfile.city),
  ]);

  // Same exclusion set as ordinary Discover (already-swiped + both block
  // directions), plus anyone already served as a Wild Card today -- see
  // lib/wildCard.ts's todaysWildCardCandidateIds doc comment for why that
  // last one isn't covered by "already swiped."
  const excluded = new Set([
    ...alreadySwiped.map((s) => s.toUserId),
    ...blockedByMe.map((b) => b.blockedId),
    ...blockedMe.map((b) => b.blockerId),
    ...usedToday,
  ]);
  const viewer = toMatchable({ ...viewerProfile, userId: viewerProfile.userId });

  const ranked = rankWildCardCandidates(viewer, candidatePool, excluded, now);
  const winner = ranked[0];
  if (!winner) {
    // Doesn't consume quota -- an empty pool isn't the user's "turn" to
    // spend, same spirit as ordinary Discover never penalizing a thin pool.
    return NextResponse.json({ error: 'No Wild Card for you right now -- check back soon', remaining: quota.remaining, limit: quota.limit }, { status: 404 });
  }

  const [p] = await Promise.all([
    db.profile.findUnique({
      where: { userId: winner.userId },
      include: {
        interests: true,
        answers: { include: { prompt: true }, take: 3 },
        // Same viewer-facing rule as /api/discover -- see that file's
        // comment on why moderationStatus: 'APPROVED' is required here.
        photos: { where: { removedAt: null, moderationStatus: 'APPROVED' }, orderBy: { position: 'asc' }, take: 1 },
      },
    }),
    // Counted the moment the card is actually handed back, not when (or
    // whether) the viewer swipes on it -- see lib/wildCard.ts.
    db.wildCardUse.create({ data: { userId: session.userId, candidateUserId: winner.userId } }),
  ]);
  if (!p) {
    // Defensive only: candidatePool can be briefly stale (see
    // getCityCandidatePool's cache TTL). The WildCardUse row above still
    // counts against today's quota -- same "the pick happened" rule as a
    // normal successful pick, it just can't render.
    return NextResponse.json({ error: 'That Wild Card just became unavailable -- try again', remaining: quota.remaining - 1, limit: quota.limit }, { status: 404 });
  }

  const card = {
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
    matchScore: winner.score,
    matchReasons: winner.reasons,
    distance: distanceLabel(viewerProfile, p),
    isWildCard: true as const,
  };

  return NextResponse.json({ card, remaining: quota.remaining - 1, limit: quota.limit });
}
