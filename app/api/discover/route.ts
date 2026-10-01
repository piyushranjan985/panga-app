import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { rankCandidates, type MatchableProfile } from '@/lib/matching';
import { distanceLabel, effectiveCoords } from '@/lib/geo';
import { checkAccountActive } from '@/lib/accountEnforcement';
import { cacheGet, cacheSet } from '@/lib/cache';

const FEED_SIZE = 15;

// Upper bound on how many eligible profiles in one city we rank per
// request. Was already 500 before this file's scale fix -- the change here
// is that it's now 500 *within the viewer's city*, not 500 out of a
// nationwide pull that got discarded down to a same-city subset afterward
// (see CANDIDATE_POOL_CACHE_TTL_SECONDS below for why that pull is cacheable
// at all now that it's scoped this way).
const CANDIDATE_POOL_LIMIT = 500;

// Same-city eligible-candidate pool is identical for every viewer in that
// city (it no longer depends on who's asking -- see getCityCandidatePool),
// so it's cached per city rather than re-queried from Postgres on every
// single /discover request. 45s is short enough that a newly active user
// shows up in the feed almost immediately, long enough to absorb a burst of
// concurrent requests from the same city with one DB round trip instead of
// one-per-request. Falls back to querying the database directly if the
// Upstash cache isn't configured (see lib/cache.ts) -- this file behaves
// identically either way, just faster once the cache is on.
const CANDIDATE_POOL_CACHE_TTL_SECONDS = 45;

function toMatchable(p: {
  userId: string;
  gender: string;
  lookingFor: string[];
  city: string;
  intent: string;
  quietMode: boolean;
  interests: { id: string }[];
  user: { lastActiveAt: Date };
  latitude?: number | null;
  longitude?: number | null;
}): MatchableProfile {
  // Effective coords (real GPS if shared, else the city's centroid) --
  // same fallback distanceLabel() already uses for the display string, now
  // also feeding lib/matching.ts's eligibility/ranking for Just Vibing /
  // Something Real / Rishta Ready. See lib/geo.ts's effectiveCoords and the
  // file-level comment on lib/matching.ts's MatchableProfile.
  const coords = effectiveCoords({ latitude: p.latitude ?? null, longitude: p.longitude ?? null, city: p.city });
  return {
    userId: p.userId,
    gender: p.gender as MatchableProfile['gender'],
    lookingFor: p.lookingFor as MatchableProfile['gender'][],
    city: p.city,
    intent: p.intent as MatchableProfile['intent'],
    quietMode: p.quietMode,
    interestIds: p.interests.map((i) => i.id),
    lastActiveAt: p.user.lastActiveAt,
    latitude: coords?.lat ?? null,
    longitude: coords?.lng ?? null,
  };
}

/**
 * City-scoped candidate pool, shared across every viewer in that city.
 *
 * This used to be a single nationwide query (`db.profile.findMany` with no
 * city filter) run fresh on every /discover request, capped at 500 rows and
 * relying on lib/matching.ts's isEligibleCandidate() same-city hard filter
 * to throw most of those 500 away *after* fetching full photos/interests/
 * answers for each of them. That's fine below a few thousand users; past
 * that -- and especially once multiple cities are live at once -- most of
 * the work done per request was wasted fetching and discarding other
 * cities' profiles. city is pushed into the SQL WHERE clause here instead
 * (using the existing @@index([city, intent, quietMode]) on Profile), which
 * is a pure performance change, not a behavior change: isEligibleCandidate's
 * same-city check was already unconditional (no cross-city path exists
 * since Circles were removed), so nothing that used to appear in a feed
 * stops appearing, and nothing that used to be excluded starts appearing.
 *
 * Deliberately returns a *lightweight* shape (select, not include) --
 * exactly what lib/matching.ts needs to rank -- because full detail
 * (photos/answers/interests for display) is only fetched afterward, for the
 * FEED_SIZE winners, not for the whole pool. See the GET handler below.
 */
async function getCityCandidatePool(city: string): Promise<MatchableProfile[]> {
  const cacheKey = `discover:pool:v2:${city}`; // v2: added latitude/longitude (intent-aware distance matching)
  const cached = await cacheGet<MatchableProfile[]>(cacheKey);
  if (cached) {
    // Round-tripping through JSON (cacheSet/cacheGet) turns Date fields into
    // ISO strings -- scoreCandidate() in lib/matching.ts calls .getTime() on
    // lastActiveAt, so this has to be a real Date again before use.
    return cached.map((c) => ({ ...c, lastActiveAt: new Date(c.lastActiveAt) }));
  }

  const rows = await db.profile.findMany({
    where: {
      city,
      quietMode: false, // isEligibleCandidate() excludes these unconditionally too -- safe to filter here
      user: { status: 'ACTIVE', discoveryRestricted: false, profileHidden: false },
    },
    select: {
      userId: true,
      gender: true,
      lookingFor: true,
      city: true,
      intent: true,
      quietMode: true,
      latitude: true,
      longitude: true,
      interests: { select: { id: true } },
      user: { select: { lastActiveAt: true } },
    },
    // Most-recently-active first, so the 500-row cap (on a city large enough
    // to hit it) favors people actually likely to respond over arbitrary DB
    // order.
    orderBy: { user: { lastActiveAt: 'desc' } },
    take: CANDIDATE_POOL_LIMIT,
  });

  const pool = rows.map(toMatchable);
  await cacheSet(cacheKey, pool, CANDIDATE_POOL_CACHE_TTL_SECONDS);
  return pool;
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
  // The `distance` field in the final feed response below is still a pure
  // *display* label (see lib/geo.ts's distanceLabel, unchanged) -- omitted
  // whenever either side's effective coordinates can't be resolved. That's
  // separate from the raw lat/lng now feeding eligibility/ranking in
  // lib/matching.ts (see toMatchable above) for Just Vibing / Something
  // Real / Rishta Ready.
  if (!viewerProfile) {
    return NextResponse.json({ error: 'Finish onboarding first' }, { status: 409 });
  }

  const [alreadySwiped, blockedByMe, blockedMe, candidatePool] = await Promise.all([
    db.swipe.findMany({ where: { fromUserId: session.userId }, select: { toUserId: true } }),
    db.block.findMany({ where: { blockerId: session.userId }, select: { blockedId: true } }),
    db.block.findMany({ where: { blockedId: session.userId }, select: { blockerId: true } }),
    getCityCandidatePool(viewerProfile.city),
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
  };

  return NextResponse.json({ feed, meta });
}
