import { db } from '@/lib/db';
import { isRealIdentityCheck } from '@/lib/safety/identityVerification';
import { toSignalProfile, type SignalProfileSource } from '@/lib/signalProfile';
import { computeSharedSignals, rankPositiveSignals, resolvePairIntent } from '@/lib/matchSignals';
import { getMatchExplanation, NO_STRONG_SIGNAL_TEXT } from '@/lib/vybeContent';

// Shared helpers behind Vybe Vouch (see docs/VYBE_VOUCH.md). Kept as its
// own lib file -- not inlined in the route handlers -- for the same
// reason lib/signalProfile.ts and lib/matchAuthz.ts are: these rules
// (the pending-invite cap, the vetter-facing summary shape) are policy,
// not transport, and both the create route and a future admin/report
// surface may need to reuse them.

export const VOUCH_INTENTS = ['SOMETHING_REAL', 'RISHTA_READY'] as const;
export type VouchReaction = 'GOOD_VYBE' | 'ASK_MORE' | 'NO_STRONG_OPINION' | 'FLAGGED';
export const VOUCH_REACTIONS: VouchReaction[] = ['GOOD_VYBE', 'ASK_MORE', 'NO_STRONG_OPINION', 'FLAGGED'];

export const VOUCH_EXPIRY_DAYS = 7;
export const VOUCH_MAX_PENDING_PER_MATCH = 3;
export const VOUCH_LABEL_MAX_LEN = 40;
export const VOUCH_NOTE_MAX_LEN = 200;

const PROFILE_INCLUDE = {
  interests: true,
  tribes: true,
  subCommunities: true,
  relationshipStyles: true,
  answers: { include: { prompt: true } },
} as const;

/**
 * Gate check at invite-creation time: Vybe Vouch only launches for
 * Something Real + Rishta Ready (not Just Vibing) -- see docs/VYBE_VOUCH.md
 * §6. Gated on each participant's CURRENT live intent, same as every other
 * post-match screen (resolvePairIntent is always called live, never off a
 * snapshot) -- see §9 for why that's the right call even when someone
 * changes their intent after the match already exists.
 */
export function isVouchEligiblePairIntent(pairIntent: string): boolean {
  return (VOUCH_INTENTS as readonly string[]).includes(pairIntent);
}

/**
 * The vetter-facing summary of the OTHER match participant (never the
 * inviter -- the vetter already knows the inviter personally). Mirrors
 * app/api/matches/[matchId]/vibe/route.ts's pipeline exactly
 * (toSignalProfile -> computeSharedSignals -> rankPositiveSignals ->
 * getMatchExplanation), just pointed at whichever profile isn't the
 * inviter's. See docs/VYBE_VOUCH.md §3b for the correction history on
 * why this reuses lib/matchSignals.ts/lib/vybeContent.ts and not the
 * superseded lib/vibeMatch.ts percent-score generator.
 */
export async function buildVouchSummary(inviterUserId: string, otherUserId: string) {
  const [inviterProfile, otherProfile] = await Promise.all([
    db.profile.findUnique({ where: { userId: inviterUserId }, include: PROFILE_INCLUDE }),
    db.profile.findUnique({
      where: { userId: otherUserId },
      include: { ...PROFILE_INCLUDE, photos: { where: { removedAt: null, moderationStatus: 'APPROVED' }, orderBy: { position: 'asc' }, take: 1 } },
    }),
  ]);
  if (!inviterProfile || !otherProfile) return null;

  const inviterSignalProfile = toSignalProfile(inviterProfile as unknown as SignalProfileSource);
  const otherSignalProfile = toSignalProfile(otherProfile as unknown as SignalProfileSource);
  const pairIntent = resolvePairIntent(inviterSignalProfile.intent, otherSignalProfile.intent);

  const rawSignals = computeSharedSignals(inviterSignalProfile, otherSignalProfile);
  const rankedSignals = rankPositiveSignals(rawSignals);
  const matchExplanation = getMatchExplanation(rankedSignals);

  const ageMs = Date.now() - otherProfile.dateOfBirth.getTime();
  const age = Math.floor(ageMs / (365.25 * 24 * 60 * 60 * 1000));

  return {
    displayName: otherProfile.displayName,
    age,
    city: otherProfile.city,
    verification: otherProfile.verification,
    verificationIsMock: !isRealIdentityCheck(),
    photoUrl: otherProfile.photos?.[0]?.url ?? null,
    pairIntent,
    vibeSummary: {
      matchExplanation, // null means: render noStrongSignalText instead
      noStrongSignalText: NO_STRONG_SIGNAL_TEXT,
    },
  };
}

export function vouchShareUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/vouch/${token}`;
}
