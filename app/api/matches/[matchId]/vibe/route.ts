import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
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
  tribes: { id: string; emoji: string; activityPhrase: string; sharedPhrase: string }[];
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
export async function GET(_req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const match = await db.match.findUnique({ where: { id: matchId } });
  if (!match || match.unmatchedAt) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (match.userAId !== session.userId && match.userBId !== session.userId) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const otherUserId = match.userAId === session.userId ? match.userBId : match.userAId;

  const [myProfile, otherProfile] = await Promise.all([
    db.profile.findUnique({ where: { userId: session.userId }, include: PROFILE_INCLUDE }),
    db.profile.findUnique({ where: { userId: otherUserId }, include: PROFILE_INCLUDE }),
  ]);
  if (!myProfile || !otherProfile) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const vibe = computeVibeMatch(toVibeMatchProfile(myProfile), toVibeMatchProfile(otherProfile));
  return NextResponse.json({ vibe });
}
