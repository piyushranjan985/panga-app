import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { isEligibleCandidate, scoreCandidate, type Gender, type IntentType } from '@/lib/matching';
import { distanceLabel, effectiveCoords, haversineKm } from '@/lib/geo';
import { checkAccountActive } from '@/lib/accountEnforcement';
import { toMatchable } from '@/lib/discoverPool';
import { ageFromDateOfBirth } from '@/lib/age';
import { parseSearchQuery } from '@/lib/searchQueryParser';
import { buildBehaviorWeights, behaviorBoost } from '@/lib/searchBehaviorBoost';

// Upper bound on same-city rows considered per search request -- same cap
// as lib/discoverPool.ts's ordinary feed pool, for the same reason (a city
// large enough to hit this is already well past what any UI shows at once).
const SEARCH_POOL_LIMIT = 500;
const SEARCH_FEED_SIZE = 30; // generous vs. the ordinary feed's 15 -- a search is a deliberate, lower-frequency action

const GENDERS: Gender[] = ['WOMAN', 'MAN', 'NON_BINARY', 'OTHER'];
const INTENTS: IntentType[] = ['JUST_VIBING', 'SOMETHING_REAL', 'RISHTA_READY'];

function parseIntParam(v: string | null): number | undefined {
  if (!v) return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

function asEnum<T extends string>(v: string | null, allowed: T[]): T | undefined {
  return v != null && (allowed as string[]).includes(v) ? (v as T) : undefined;
}

/**
 * GET /api/discover/search -- item 5 of the Sept 2026 feature request.
 * "Both" structured filters AND free-text search (per the user's explicit
 * scoping answer), parsed/ranked entirely rule-based: no LLM, no paid API
 * (see lib/searchQueryParser.ts and lib/searchBehaviorBoost.ts).
 *
 * Deliberately a standalone route rather than a change to
 * app/api/discover/route.ts: that route's candidate pool (lib/
 * discoverPool.ts) is cached and intentionally lightweight (no dateOfBirth
 * / tribe ids -- see its MatchableProfile shape), which is exactly right
 * for the feed every user loads constantly, but wrong for an explicit,
 * occasional search that needs age + tribe filtering. This route queries
 * fresh instead of sharing that cache, and reuses isEligibleCandidate /
 * scoreCandidate UNCHANGED so search never surfaces someone the ordinary
 * feed's hard rules wouldn't otherwise allow -- it only narrows further
 * and re-ranks on top.
 */
export async function GET(req: Request) {
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

  const params = new URL(req.url).searchParams;
  const q = params.get('q') ?? '';
  const explicitGender = params.get('gender');
  const explicitIntent = params.get('intent');

  const filters = {
    gender: asEnum(explicitGender, GENDERS),
    intent: asEnum(explicitIntent, INTENTS),
    ageMin: parseIntParam(params.get('ageMin')),
    ageMax: parseIntParam(params.get('ageMax')),
    distanceKm: parseIntParam(params.get('distanceKm')),
    interestIds: (params.get('interestIds') ?? '').split(',').filter(Boolean),
    tribeIds: (params.get('tribeIds') ?? '').split(',').filter(Boolean),
  };

  // The NL box only ever fills in a field the structured panel left blank
  // -- explicit filter controls always win over what got parsed from text.
  // See lib/searchQueryParser.ts's file comment.
  let parsed: ReturnType<typeof parseSearchQuery> | null = null;
  if (q.trim()) {
    const [interests, tribes] = await Promise.all([
      db.interest.findMany({ select: { id: true, label: true } }),
      db.tribe.findMany({ select: { id: true, label: true } }),
    ]);
    parsed = parseSearchQuery(q, { interests, tribes });
    filters.gender ??= parsed.gender;
    filters.intent ??= parsed.intent;
    filters.ageMin ??= parsed.ageMin;
    filters.ageMax ??= parsed.ageMax;
    filters.distanceKm ??= parsed.distanceKm;
    if (filters.interestIds.length === 0) filters.interestIds = parsed.interestIds;
    if (filters.tribeIds.length === 0) filters.tribeIds = parsed.tribeIds;
  }

  const [blockedByMe, blockedMe, poolRows, behaviorWeights] = await Promise.all([
    db.block.findMany({ where: { blockerId: session.userId }, select: { blockedId: true } }),
    db.block.findMany({ where: { blockedId: session.userId }, select: { blockerId: true } }),
    db.profile.findMany({
      where: {
        city: viewerProfile.city,
        quietMode: false,
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
        dateOfBirth: true,
        interests: { select: { id: true } },
        tribes: { select: { id: true } },
        user: { select: { lastActiveAt: true } },
      },
      orderBy: { user: { lastActiveAt: 'desc' } },
      take: SEARCH_POOL_LIMIT,
    }),
    buildBehaviorWeights(session.userId),
  ]);

  // Scoped to this request's pool rows, not the viewer's entire swipe
  // history -- see app/api/discover/route.ts's identical comment. The
  // for-loop below only ever checks `excluded` against poolRows, so this
  // is exactly the same exclusion set, just bounded by SEARCH_POOL_LIMIT
  // instead of growing forever with how many times someone's searched.
  const poolUserIds = poolRows.map((r) => r.userId);
  const alreadySwiped = poolUserIds.length
    ? await db.swipe.findMany({
        where: { fromUserId: session.userId, toUserId: { in: poolUserIds } },
        select: { toUserId: true },
      })
    : [];

  const excluded = new Set([
    ...alreadySwiped.map((s) => s.toUserId),
    ...blockedByMe.map((b) => b.blockedId),
    ...blockedMe.map((b) => b.blockerId),
  ]);
  const viewerMatchable = toMatchable({ ...viewerProfile, userId: viewerProfile.userId });
  const viewerCoords = effectiveCoords(viewerProfile);

  const scored: { userId: string; score: number; reasons: string[] }[] = [];
  for (const row of poolRows) {
    if (excluded.has(row.userId)) continue;
    const candidateMatchable = toMatchable(row);
    if (!isEligibleCandidate(viewerMatchable, candidateMatchable)) continue;

    if (filters.gender && row.gender !== filters.gender) continue;
    if (filters.intent && row.intent !== filters.intent) continue;

    const age = ageFromDateOfBirth(row.dateOfBirth);
    if (filters.ageMin != null && age < filters.ageMin) continue;
    if (filters.ageMax != null && age > filters.ageMax) continue;

    if (filters.distanceKm != null) {
      const candidateCoords = effectiveCoords(row);
      const distance =
        viewerCoords && candidateCoords
          ? haversineKm(viewerCoords.lat, viewerCoords.lng, candidateCoords.lat, candidateCoords.lng)
          : null;
      if (distance == null || distance > filters.distanceKm) continue;
    }

    const candidateInterestIds = row.interests.map((i) => i.id);
    const candidateTribeIds = row.tribes.map((t) => t.id);
    if (filters.interestIds.length > 0 && !candidateInterestIds.some((id) => filters.interestIds.includes(id))) continue;
    if (filters.tribeIds.length > 0 && !candidateTribeIds.some((id) => filters.tribeIds.includes(id))) continue;

    const base = scoreCandidate(viewerMatchable, candidateMatchable);
    const boost = behaviorBoost(candidateInterestIds, candidateTribeIds, behaviorWeights);
    const reasons = [...base.reasons];
    if (boost > 0.75) reasons.push('matches what you usually like');

    scored.push({ userId: row.userId, score: Math.round((base.score + boost) * 100) / 100, reasons });
  }

  scored.sort((a, b) => b.score - a.score);
  const ranked = scored.slice(0, SEARCH_FEED_SIZE);
  const winnerIds = ranked.map((r) => r.userId);

  const winners = winnerIds.length
    ? await db.profile.findMany({
        where: { userId: { in: winnerIds } },
        include: {
          interests: true,
          answers: { include: { prompt: true }, take: 3 },
          // Same reasoning as app/api/discover/route.ts: only an
          // already-human-approved photo is ever shown to someone else.
          photos: { where: { removedAt: null, moderationStatus: 'APPROVED' }, orderBy: { position: 'asc' }, take: 1 },
        },
      })
    : [];

  const byId = new Map(winners.map((p) => [p.userId, p]));
  const feed = ranked
    .map((r) => {
      const p = byId.get(r.userId);
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
        age: ageFromDateOfBirth(p.dateOfBirth),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Echoed back so the search UI can show "Searching for: women, 24-29,
  // within 15km" chips -- makes the rule-based parsing legible/correctable
  // instead of a black box, same spirit as matchReasons elsewhere.
  const appliedFilters = {
    gender: filters.gender ?? null,
    intent: filters.intent ?? null,
    ageMin: filters.ageMin ?? null,
    ageMax: filters.ageMax ?? null,
    distanceKm: filters.distanceKm ?? null,
    interestIds: filters.interestIds,
    tribeIds: filters.tribeIds,
    parsedFromText: q.trim() ? parsed : null,
  };

  return NextResponse.json({ feed, appliedFilters });
}
