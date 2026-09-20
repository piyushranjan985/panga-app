import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { assertParticipant, otherUserId } from '@/lib/matchAuthz';
import { computeVibeMatch, type VibeMatchProfile, type IntentType } from '@/lib/vibeMatch';

const PROFILE_INCLUDE = {
  interests: true,
  tribes: true,
  subCommunities: true,
  relationshipStyles: true,
} as const;

type LoadedProfile = {
  intent: string;
  interests: { id: string; label: string; emoji: string }[];
  tribes: { id: string; slug: string; emoji: string; activityPhrase: string; sharedPhrase: string }[];
  subCommunities: { id: string; tribeId: string }[];
  relationshipStyles: { id: string; pairPhrase: string }[];
};

function toVibeMatchProfile(p: LoadedProfile): VibeMatchProfile {
  return {
    intent: p.intent as IntentType,
    interests: p.interests,
    tribes: p.tribes,
    subCommunities: p.subCommunities,
    relationshipStyles: p.relationshipStyles,
  };
}

// The Vibe Match reveal ("🔥 87% Vibe Match ... you both love ...") shown
// at the top of a match's chat — see lib/vibeMatch.ts for why this is a
// separate, friendlier calculation from the discover feed's ranking score.
// Also returns the plain shared-interest labels and shared-tribe slugs
// (not the "pretty" activityPhrase text `vibe.sharedTribes` uses) --
// lib/conversationStarters.ts's pickStarter/askQuestionFor need the raw
// keys to look starters up by, for the match modal's "Send a Vybe" and
// the chat page's "⚡ Vybe" / "Ask about me" features.
export async function GET(_req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const match = await assertParticipant(matchId, session.userId);
  if (!match) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const otherId = otherUserId(match, session.userId);

  const [myProfile, otherProfile] = await Promise.all([
    db.profile.findUnique({ where: { userId: session.userId }, include: PROFILE_INCLUDE }),
    db.profile.findUnique({ where: { userId: otherId }, include: PROFILE_INCLUDE }),
  ]);
  if (!myProfile || !otherProfile) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const vibe = computeVibeMatch(toVibeMatchProfile(myProfile), toVibeMatchProfile(otherProfile));

  const myTribeSlugs = new Set(myProfile.tribes.map((t) => t.slug));
  const sharedTribeSlugs = otherProfile.tribes.filter((t) => myTribeSlugs.has(t.slug)).map((t) => t.slug);
  const sharedInterestLabels = vibe.sharedInterests.map((i) => i.label);

  return NextResponse.json({ vibe, sharedInterestLabels, sharedTribeSlugs });
}
