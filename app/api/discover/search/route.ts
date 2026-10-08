import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { isEligibleCandidate, scoreCandidate, type Gender, type IntentType } from '@/lib/matching';
import { distanceLabel, effectiveCoords, haversineKm } from '@/lib/geo';
import { checkAccountActive } from '@/lib/accountEnforcement';
import { toMatchable, queryEligiblePool, ELIGIBLE_POOL_LIMIT } from '@/lib/discoverPool';
import { ageFromDateOfBirth } from '@/lib/age';
import { parseSearchQuery } from '@/lib/searchQueryParser';
import { buildBehaviorWeights, behaviorBoost } from '@/lib/searchBehaviorBoost';

// Same eligible-pool size as lib/discoverPool.ts's ordinary feed pool
// (imported, not duplicated, so the two can't drift) -- for the same
// reason: a city large enough to hit this is already well past what any
// UI shows at once.
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
 * discoverPool.ts) is cached, which is exactly right for the feed every
 * user loads constantly, but wrong for an explicit, occasional search
 * that also needs age + tribe filtering (not part of the cached pool's
 * lightweight shape) and can't tolerate a stale cache the way a quick
 * browse can. This route calls lib/discoverPool.ts's queryEligiblePool()
 * directly -- same gender/intent/distance-or-city SQL filter as the
 * ordinary feed, just run fresh against the viewer's exact coordinates
 * instead of a cached, grid-cell-bucketed one -- then fetches the extra
 * per-candidate fields (dateOfBirth, tribes) that filter needs. Reuses
 * isEligibleCandidate() / scoreCandidate() UNCHANGED so search never
 * surfaces someone the ordinary feed's hard rules wouldn't otherwise
 * allow -- it only narrows further and re-ranks on top.
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

  // Built before the pool fetch below -- queryEligiblePool needs the
  // viewer's own gender/lookingFor/intent/effective-coords, same as
  // lib/discoverPool.ts's cached pool, just queried from the viewer's
  // exact point instead of a grid cell's center (no cache here to share
  // across viewers, so there's no reason to bucket).
  const viewerMatchable = toMatchable({ ...viewerProfile, userId: viewerProfile.userId });
  const viewerCoords = effectiveCoords(viewerProfile);

  const [blockedByMe, blockedMe, eligibleRows, behaviorWeights] = await Promise.all([
    db.block.findMany({ where: { blockerId: session.userId }, select: { blockedId: true } }),
    db.block.findMany({ where: { blockedId: session.userId }, select: { blockerId: true } }),
    // Should always resolve (every supported city has a centroid
    // fallback -- see lib/geo.ts) -- guarded anyway rather than letting a
    // malformed point reach Postgres as the ST_DWithin origin.
    viewerCoords
      ? queryEligiblePool(
          {
            city: viewerProfile.city,
            viewerUserId: session.userId,
            viewerGender: viewerProfile.gender,
            viewerLookingFor: viewerProfile.lookingFor,
            viewerIntent: viewerProfile.intent,
            viewerLat: viewerCoords.lat,
            viewerLng: viewerCoords.lng,
          },
          ELIGIBLE_POOL_LIMIT,
        )
      : Promise.resolve([]),
    buildBehaviorWeights(session.userId),
  ]);

  // queryEligiblePool's shared SQL doesn't select dateOfBirth/interests/
  // tribes (the cached ordinary-feed pool never needed them -- see
  // lib/discoverPool.ts's MatchableProfile), so fetch those for just the
  // rows it returned, same batched-by-userId shape as the rest of this
  // codebase uses for "detail for a pool of ids" (see
  // app/api/discover/route.ts's winners fetch).
  const poolUserIds = eligibleRows.map((r) => r.userId);
  const [alreadySwiped, extraFieldRows] = await Promise.all([
    // Scoped to this request's pool, not the viewer's entire swipe
    // history -- see app/api/discover/route.ts's identical comment.
    poolUserIds.length
      ? db.swipe.findMany({
          where: { fromUserId: session.userId, toUserId: { in: poolUserIds } },
          select: { toUserId: true },
        })
      : Promise.resolve([]),
    poolUserIds.length
      ? db.profile.findMany({
          where: { userId: { in: poolUserIds } },
          select: {
            userId: true,
            dateOfBirth: true,
            interests: { select: { id: true } },
            tribes: { select: { id: true } },
          },
        })
      : Promise.resolve([]),
  ]);
  const extraFieldsByUserId = new Map(extraFieldRows.map((f) => [f.userId, f]));
  const poolRows = eligibleRows
    .map((r) => {
      const extra = extraFieldsByUserId.get(r.userId);
      // Defensive only: would mean a profile was deleted between the two
      // queries above -- skip rather than throw.
      if (!extra) return null;
      // toMatchable() (called on this row below) expects user.lastActiveAt
      // nested, matching the shape db.profile.findMany's `include` used to
      // produce here before this route switched to queryEligiblePool's
      // flat row shape.
      return {
        ...r,
        user: { lastActiveAt: r.lastActiveAt },
        dateOfBirth: extra.dateOfBirth,
        interests: extra.interests,
        tribes: extra.tribes,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const excluded = new Set([
    ...alreadySwiped.map((s) => s.toUserId),
    ...blockedByMe.map((b) => b.blockedId),
    ...blockedMe.map((b) => b.blockerId),
  ]);

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
