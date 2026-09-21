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
        photos: { orderBy: { position: 'asc' }, take: 1 },
      },
    }),
    db.profile.findUnique({ where: { userId: session.userId }, select: { latitude: true, longitude: true } }),
  ]);
  if (!profile) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const ageMs = Date.now() - profile.dateOfBirth.getTime();
  const age = Math.floor(ageMs / (365.25 * 24 * 60 * 60 * 1000));

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
      displayName: profile.displayName,
      age,
      city: profile.city,
      intent: profile.intent,
      avatarSeed: profile.avatarSeed,
      avatarHue: profile.avatarHue,
      verification: profile.verification,
      photoUrl: profile.photos[0]?.url ?? null,
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
  });
}
