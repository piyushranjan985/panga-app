import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { assertParticipant, otherUserId } from '@/lib/matchAuthz';
import { toSignalProfile } from '@/lib/signalProfile';
import {
  computeSharedSignals,
  rankPositiveSignals,
  pickComplementarySignals,
  resolvePairIntent,
} from '@/lib/matchSignals';
import { getMatchExplanation, getQuickHelloMessages, NO_STRONG_SIGNAL_TEXT } from '@/lib/vybeContent';

const PROFILE_INCLUDE = {
  interests: true,
  tribes: true,
  subCommunities: true,
  relationshipStyles: true,
  answers: { include: { prompt: true } },
} as const;

// The post-match "why you two might click" engine -- see lib/matchSignals.ts
// for the tiered scoring this is built on. Deliberately supersedes the old
// percent-based lib/vibeMatch.ts reveal for every post-match screen: the
// product spec bans showing anything that reads as a manufactured
// compatibility score. `sharedInterestLabels`/`sharedTribeSlugs` are kept
// for lib/conversationStarters.ts's pickStarter/askQuestionFor callers.
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

  const mySignalProfile = toSignalProfile(myProfile);
  const otherSignalProfile = toSignalProfile(otherProfile);
  const pairIntent = resolvePairIntent(mySignalProfile.intent, otherSignalProfile.intent);

  const rawSignals = computeSharedSignals(mySignalProfile, otherSignalProfile);
  const rankedSignals = rankPositiveSignals(rawSignals);
  const complementarySignals = pickComplementarySignals(rawSignals);
  const matchExplanation = getMatchExplanation(rankedSignals);

  const myTribeSlugs = new Set(myProfile.tribes.map((t) => t.slug));
  const sharedTribeSlugs = otherProfile.tribes.filter((t) => myTribeSlugs.has(t.slug)).map((t) => t.slug);
  const myInterestLabels = new Set(myProfile.interests.map((i) => i.label));
  const sharedInterestLabels = otherProfile.interests.filter((i) => myInterestLabels.has(i.label)).map((i) => i.label);

  return NextResponse.json({
    pairIntent,
    rankedSignals,
    complementarySignals,
    matchExplanation, // null means: show NO_STRONG_SIGNAL_TEXT
    noStrongSignalText: NO_STRONG_SIGNAL_TEXT,
    quickHelloMessages: getQuickHelloMessages(pairIntent),
    sharedInterestLabels,
    sharedTribeSlugs,
  });
}
