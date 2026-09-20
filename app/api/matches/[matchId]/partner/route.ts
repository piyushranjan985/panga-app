import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { assertParticipant, otherUserId } from '@/lib/matchAuthz';

// The other participant's profile, shaped for the chat screen's "Match
// Profile" panel (tap their name/photo) and the "🎯 Ask about me" picker
// -- a deliberately small subset of GET /api/profile's full shape (no
// bio-editing fields, no onboarding-only data), since this is someone
// else's profile being viewed, not the signed-in user's own.
export async function GET(_req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const match = await assertParticipant(matchId, session.userId);
  if (!match) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const otherId = otherUserId(match, session.userId);

  const profile = await db.profile.findUnique({
    where: { userId: otherId },
    include: {
      interests: true,
      tribes: true,
      relationshipStyles: true,
      photos: { orderBy: { position: 'asc' }, take: 1 },
    },
  });
  if (!profile) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const ageMs = Date.now() - profile.dateOfBirth.getTime();
  const age = Math.floor(ageMs / (365.25 * 24 * 60 * 60 * 1000));

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
    },
  });
}
