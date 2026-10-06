import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { describeMatchOrigin } from '@/lib/matchOrigin';

// Defensive bound for a very long-tenured, very active user -- matches
// lists aren't currently paginated in the UI (unlike chat messages above,
// which can legitimately run into the tens of thousands for one
// conversation, nobody realistically accumulates more than a few hundred
// live matches), so this is a ceiling, not a page size.
const MATCH_LIST_LIMIT = 300;

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const matches = await db.match.findMany({
    where: {
      unmatchedAt: null,
      OR: [
        // "Hide conversation" (see the chat screen's ... menu) is
        // per-side, not a real unmatch -- excluded here rather than at
        // the schema level so the other person's list is unaffected.
        { userAId: session.userId, hiddenAAt: null },
        { userBId: session.userId, hiddenBAt: null },
      ],
    },
    select: {
      id: true,
      createdAt: true,
      userAId: true,
      userBId: true,
      // Blind reveal -- see docs/MYSTERY_MATCH.md. Ordinary matches are
      // always isMysteryMatch === false with both reveal timestamps
      // null, so this select costs nothing for the common case.
      isMysteryMatch: true,
      // See lib/matchOrigin.ts -- lets the inbox badge below name the
      // exact category instead of a generic "Mystery Match" for all three.
      mysteryCategory: true,
      revealedAAt: true,
      revealedBAt: true,
      // select, not include -- the full User+Profile models carry dozens
      // of fields (onboarding tags, verification internals, etc.) this
      // list view never uses; only one side of each pair is even shown
      // (see `other` below), so the previous `include` fetched roughly
      // 2x the profile data actually displayed, for every match, on
      // every call.
      userA: { select: { id: true, profile: { select: { displayName: true, avatarSeed: true, avatarHue: true, intent: true } } } },
      userB: { select: { id: true, profile: { select: { displayName: true, avatarSeed: true, avatarHue: true, intent: true } } } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { body: true, senderId: true, createdAt: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: MATCH_LIST_LIMIT,
  });

  // Wild Card attribution for the inbox badge -- one-sided, same rule as
  // app/api/matches/[matchId]/partner/route.ts (only true for the person
  // who actually drew this match as their Wild Card). One bulk query for
  // every "other side" across the whole list, instead of a query per
  // row -- this list can hold up to MATCH_LIST_LIMIT matches.
  const otherIds = matches.map((m) => (m.userAId === session.userId ? m.userBId : m.userAId));
  const wildCardDraws = otherIds.length
    ? await db.wildCardUse.findMany({
        where: { userId: session.userId, candidateUserId: { in: otherIds } },
        select: { candidateUserId: true },
      })
    : [];
  const wildCardDrawnIds = new Set(wildCardDraws.map((w) => w.candidateUserId));

  const shaped = matches.map((m) => {
    const isUserA = m.userAId === session.userId;
    const other = isUserA ? m.userB : m.userA;
    const iRevealed = isUserA ? Boolean(m.revealedAAt) : Boolean(m.revealedBAt);
    const partnerRevealed = isUserA ? Boolean(m.revealedBAt) : Boolean(m.revealedAAt);
    const stillMysterious = m.isMysteryMatch && !(iRevealed && partnerRevealed);
    return {
      matchId: m.id,
      createdAt: m.createdAt,
      other: {
        userId: other.id,
        // Masked until mutual reveal -- see app/api/matches/[matchId]/partner's
        // matching note; the list screen gets the same treatment so a
        // Mystery Match pairing doesn't give away the name there instead.
        displayName: stillMysterious ? 'Mystery Match' : other.profile?.displayName ?? 'findmyVybe user',
        avatarSeed: other.profile?.avatarSeed ?? 'P',
        avatarHue: other.profile?.avatarHue ?? 1,
        intent: other.profile?.intent ?? 'SOMETHING_REAL',
      },
      lastMessage: m.messages[0]
        ? { body: m.messages[0].body, senderId: m.messages[0].senderId, createdAt: m.messages[0].createdAt }
        : null,
      // See lib/matchOrigin.ts -- null for an ordinary Discover match
      // (no badge shown), otherwise {emoji, label} for the inbox row.
      origin: describeMatchOrigin({
        isMysteryMatch: m.isMysteryMatch,
        mysteryCategory: m.mysteryCategory,
        foundViaWildCard: wildCardDrawnIds.has(other.id),
      }),
    };
  });

  return NextResponse.json({ matches: shaped });
}
