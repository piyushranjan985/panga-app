import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { assertParticipant, otherUserId } from '@/lib/matchAuthz';
import { VALUES_OPTIONS, FUTURE_VIBE_QUESTIONS, CHILDREN_OPTIONS } from '@/lib/constants';
import { distanceLabel } from '@/lib/geo';

function tagLabel(slug: string, catalog: { slug: string; label: string; emoji: string }[]) {
  return catalog.find((c) => c.slug === slug) ?? null;
}

// The other participant's profile, shaped for the chat screen's "Match
// Profile" panel (tap their name/photo) and the "🎯 Ask about me" picker
// -- a deliberately small subset of GET /api/profile's full shape (no
// bio-editing fields, no onboarding-only data), since this is someone
// else's profile being viewed, not the signed-in user's own.
//
// Also returns `matchMeta` (this viewer's own mute state on this match)
// and, for Rishta Ready pairs, the extended "What matters to me" /
// "Future vibe" sections the post-match spec adds to this panel --
// omitted entirely for Just Vibing / Something Real partners since those
// fields are always empty for them.
export async function GET(_req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const match = await assertParticipant(matchId, session.userId);
  if (!match) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const otherId = otherUserId(match, session.userId);
  const isUserA = match.userAId === session.userId;

  const [profile, myProfile] = await Promise.all([
    db.profile.findUnique({
      where: { userId: otherId },
      include: {
        interests: true,
        tribes: true,
        relationshipStyles: true,
        // Same viewer-facing rule as app/api/discover/route.ts -- a matched
        // partner is still another user, not the profile owner, so an
        // unapproved or admin-removed photo must never render here either.
        photos: { where: { removedAt: null, moderationStatus: 'APPROVED' }, orderBy: { position: 'asc' }, take: 1 },
      },
    }),
    db.profile.findUnique({ where: { userId: session.userId }, select: { latitude: true, longitude: true, city: true } }),
  ]);
  if (!profile) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const ageMs = Date.now() - profile.dateOfBirth.getTime();
  const age = Math.floor(ageMs / (365.25 * 24 * 60 * 60 * 1000));

  // Blind reveal -- see docs/MYSTERY_MATCH.md and
  // prisma/schema.prisma's comment on Match.revealedAAt/revealedBAt.
  // Ordinary matches always have isMysteryMatch === false, so this is a
  // no-op for everyone except an unrevealed Mystery Match pairing.
  const iRevealed = isUserA ? Boolean(match.revealedAAt) : Boolean(match.revealedBAt);
  const partnerRevealed = isUserA ? Boolean(match.revealedBAt) : Boolean(match.revealedAAt);
  const fullyRevealed = iRevealed && partnerRevealed;
  const stillMysterious = match.isMysteryMatch && !fullyRevealed;

  const futureVibe =
    profile.intent === 'RISHTA_READY'
      ? FUTURE_VIBE_QUESTIONS.map((q) => {
          const picked = profile[(`future${q.key[0]!.toUpperCase()}${q.key.slice(1)}`) as 'futureHome' | 'futureFamily' | 'futureCareer' | 'futureMoney'];
          const option = picked === q.optionA.slug ? q.optionA : picked === q.optionB.slug ? q.optionB : null;
          return option ? { question: q.question, ...option } : null;
        }).filter((v): v is { question: string; slug: string; label: string; emoji: string } => Boolean(v))
      : [];

  return NextResponse.json({
    partner: {
      userId: profile.userId,
      // Masked while this Mystery Match pairing is still unrevealed --
      // see the stillMysterious note above and photoUrl's own note below.
      // avatarSeed/avatarHue are left as-is -- they're not identifying on
      // their own (a letter + a hue), and the client needs them to render
      // the placeholder glyph.
      displayName: stillMysterious ? 'Mystery Match' : profile.displayName,
      age: stillMysterious ? null : age,
      city: profile.city,
      intent: profile.intent,
      avatarSeed: profile.avatarSeed,
      avatarHue: profile.avatarHue,
      verification: profile.verification,
      // Masked the same way as displayName/age -- without this, the real
      // photo URL would reach the client (and be visible in a network
      // inspector) before mutual reveal, even though the chat UI itself
      // never renders it until then. See docs/MYSTERY_MATCH.md §8.
      photoUrl: stillMysterious ? null : profile.photos[0]?.url ?? null,
      interests: profile.interests.map((i) => ({ id: i.id, label: i.label, emoji: i.emoji })),
      tribes: profile.tribes.map((t) => ({ id: t.id, slug: t.slug, label: t.label, emoji: t.emoji, personaLabel: t.personaLabel })),
      relationshipStyles: profile.relationshipStyles.map((r) => ({ id: r.id, label: r.label, emoji: r.emoji })),
      // Rishta Ready only -- see the spec's "What matters to me" / "Future vibe" panel sections.
      valuesTags: profile.valuesTags.map((slug) => tagLabel(slug, VALUES_OPTIONS)).filter(Boolean),
      futureVibe,
      children: profile.children ? tagLabel(profile.children, CHILDREN_OPTIONS) : null,
      // Rounded distance only -- see lib/geo.ts; null when either side
      // hasn't shared a location, never a placeholder.
      distance: distanceLabel(myProfile, profile),
    },
    matchMeta: {
      isMuted: isUserA ? Boolean(match.mutedAAt) : Boolean(match.mutedBAt),
    },
    revealStatus: {
      isMysteryMatch: match.isMysteryMatch,
      myRevealed: iRevealed,
      partnerRevealed,
      fullyRevealed,
    },
  });
}
