import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { rankCandidates } from '@/lib/matching';
import { distanceLabel } from '@/lib/geo';
import { checkAccountActive } from '@/lib/accountEnforcement';
import { getCityCandidatePool, toMatchable } from '@/lib/discoverPool';
import { wildCardQuota } from '@/lib/wildCard';

const FEED_SIZE = 15;

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
  // The `distance` field in the final feed response below is still a pure
  // *display* label (see lib/geo.ts's distanceLabel, unchanged) -- omitted
  // whenever either side's effective coordinates can't be resolved. That's
  // separate from the raw lat/lng now feeding eligibility/ranking in
  // lib/matching.ts (see toMatchable above) for Just Vibing / Something
  // Real / Rishta Ready.
  if (!viewerProfile) {
    return NextResponse.json({ error: 'Finish onboarding first' }, { status: 409 });
  }

  const [blockedByMe, blockedMe, candidatePool, wildCard] = await Promise.all([
    db.block.findMany({ where: { blockerId: session.userId }, select: { blockedId: true } }),
    db.block.findMany({ where: { blockedId: session.userId }, select: { blockerId: true } }),
    getCityCandidatePool(viewerProfile.city),
    // Just a count for the Discover page's "🃏 Wild Card (N left)" button --
    // see docs/WILD_CARD.md. The actual wildcard fetch/scoring happens in
    // app/api/discover/wildcard/route.ts; this route never ranks a Wild
    // Card candidate itself.
    wildCardQuota(session.userId, new Date()),
  ]);

  // Scoped to just this request's candidate pool, not the viewer's entire
  // swipe history. rankCandidates() below only ever checks `excluded`
  // against members of candidatePool (see lib/matching.ts), so a swipe on
  // a userId outside the pool can never change the result -- this is the
  // same exclusion set, just computed without pulling someone's full
  // lifetime swipe count (unbounded, growing forever) on every single
  // Discover page load. Bounded by the pool's own cap (CANDIDATE_POOL_LIMIT
  // in lib/discoverPool.ts) instead.
  const poolUserIds = candidatePool.map((c) => c.userId);
  const alreadySwiped = poolUserIds.length
    ? await db.swipe.findMany({
        where: { fromUserId: session.userId, toUserId: { in: poolUserIds } },
        select: { toUserId: true },
      })
    : [];

  // Blocking (see app/api/matches/[matchId]/block/route.ts) excludes both
  // directions from discovery from then on, same as an already-swiped-on
  // profile -- one combined exclusion set.
  const excluded = new Set([
    ...alreadySwiped.map((s) => s.toUserId),
    ...blockedByMe.map((b) => b.blockedId),
    ...blockedMe.map((b) => b.blockerId),
  ]);
  const viewer = toMatchable({ ...viewerProfile, userId: viewerProfile.userId });

  // isEligibleCandidate() already drops the viewer's own id (see
  // lib/matching.ts), so getCityCandidatePool() -- shared across every
  // viewer in the city -- doesn't need a per-viewer "not me" filter at the
  // DB level; that's what makes it cacheable across viewers at all.
  const ranked = rankCandidates(viewer, candidatePool, excluded).slice(0, FEED_SIZE);
  const winnerIds = ranked.map((r) => r.userId);

  // Full detail (photos/interests/prompt answers) is fetched only for the
  // FEED_SIZE winners, not the whole candidate pool -- and deliberately not
  // cached, since photo moderation status needs to be current, not up to
  // CANDIDATE_POOL_CACHE_TTL_SECONDS stale.
  const winners = winnerIds.length
    ? await db.profile.findMany({
        where: { userId: { in: winnerIds } },
        include: {
          interests: true,
          answers: { include: { prompt: true }, take: 3 },
          // Viewer-facing: moderationStatus: 'APPROVED' is required here, not
          // just removedAt: null -- a MANUAL_REVIEW photo (borderline nudity
          // score, or an unresolved multi-face shot, see policyEngine.ts) had a
          // real Photo row and no filter here, so it was visible to every other
          // user browsing /discover before a human ever looked at it -- exactly
          // what schema.prisma's comment on Photo.moderationStatus promises
          // never happens ("nothing becomes visible to other users before
          // that"). This is the one signal that actually enforces it.
          photos: { where: { removedAt: null, moderationStatus: 'APPROVED' }, orderBy: { position: 'asc' }, take: 1 },
        },
      })
    : [];

  const byId = new Map(winners.map((p) => [p.userId, p]));
  const feed = ranked
    .map((r) => {
      const p = byId.get(r.userId);
      // Defensive only: the pool can be up to CANDIDATE_POOL_CACHE_TTL_SECONDS
      // stale, so in the rare case a profile was deleted in that window, skip
      // it rather than throw.
      if (!p) return null;
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
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Lets the Discover page show a contextual "share your location" prompt
  // only when it actually matters: Just Vibing mode is distance-based (see
  // lib/matching.ts), so a viewer without shared GPS is only getting
  // city-centroid-level matching for it (see lib/geo.ts's effectiveCoords)
  // -- not broken, just less precise. Something Real / Rishta Ready don't
  // need this nudge, since same-city alone is still always sufficient
  // there.
  const meta = {
    intent: viewerProfile.intent,
    hasSharedLocation: viewerProfile.latitude != null,
    wildCard,
  };

  return NextResponse.json({ feed, meta });
}
