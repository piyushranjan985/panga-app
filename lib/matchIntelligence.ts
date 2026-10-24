/**
 * Rules-based "matching intelligence" signal -- a 0..1 score meant to
 * nudge ranking toward profiles that are complete, verified and actually
 * active, using only data findmyVybe already captures today. No AI/LLM
 * calls anywhere in this file, on purpose (see docs on the matching-
 * intelligence rollout): this is Phase 3 of that rollout, a deterministic
 * rules engine; a possible future paid-AI provider is a later phase that
 * would implement IntelligenceSignalProvider below, not touch this one.
 *
 * computeIntelligenceSignal is deliberately pure and DB/framework-free --
 * same "framework- and database-free, unit-testable with nothing but a
 * TypeScript runtime" stance as lib/matching.ts (see scripts/
 * verify-matching.ts and this file's own scripts/verify-matchIntelligence.ts)
 * -- and every input is clamped to [0,1] before weighting, mirroring the
 * taper-function style lib/matching.ts already uses for its age/recency/
 * proximity terms, so a caller handing in an out-of-range or slightly
 * malformed input can never push the output outside [0,1] either.
 *
 * rulesBasedProvider is the only thing here that touches Prisma -- it
 * pulls today's real inputs (profile completeness, verification,
 * recent-match count, days since last activity) for a batch of users and
 * calls straight into computeIntelligenceSignal, same "query layer calls
 * into pure scoring, scoring never queries" split lib/discoverPool.ts /
 * lib/matching.ts already follow.
 */
import { db } from '@/lib/db';
import type { VerificationStatus } from '@prisma/client';

export interface IntelligenceSignalInputs {
  /**
   * 0 (nothing filled in) .. 1 (every completeness slot filled) -- see
   * rulesBasedProvider's profileCompletenessFactor for how this is derived
   * from today's Profile fields (bio, approved photos, interests, prompt
   * answers). Callers outside this file should already be handing in a
   * value in [0,1]; computeIntelligenceSignal clamps it regardless.
   */
  completeness: number;
  /** Profile.verification as stored today -- see prisma/schema.prisma's VerificationStatus enum. */
  verification: VerificationStatus;
  /** Count of (non-unmatched) Match rows created in the last 30 days. */
  recentMatchCount: number;
  /** Days since User.lastActiveAt -- may be fractional, never negative in practice (lastActiveAt is never in the future). */
  daysSinceLastActive: number;
}

/**
 * Weights sum to 1, so a weighted sum of [0,1]-clamped factors is itself
 * already in [0,1] -- clamping the final result below is just a safety
 * net, not load-bearing. Completeness and verification dominate (a
 * trustworthy, fillable-out-today profile is the whole point of this
 * signal); recent engagement and recency are smaller secondary terms, same
 * "primary vs. tiebreaker" split lib/matching.ts's own WEIGHTS already
 * draws between e.g. proximityPrimary and proximitySecondary.
 */
const SIGNAL_WEIGHTS = {
  completeness: 0.4,
  verification: 0.35,
  recentEngagement: 0.15,
  recency: 0.1,
};

// How many matches in the last 30 days earns full credit for the
// recent-engagement term -- same linear-taper-to-a-cap shape as
// lib/matching.ts's age/proximity factors, just counting matches instead
// of years or km. Arbitrary but reasonable: a handful of recent matches is
// already a clearly "actively matching" profile; this isn't meant to keep
// rewarding whoever has the single highest match count on the platform.
const RECENT_MATCH_CAP = 5;

// Days since last activity before the recency term fully disappears --
// shorter than lib/matching.ts's own 48h recency window on purpose: that
// window rewards "active in the last two days" for ranking a single
// feed load, this one is a much coarser, once-a-day-recomputed signal
// about whether someone's still a live, engaged user at all.
const RECENCY_TAPER_DAYS = 14;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * VERIFIED earns full credit; MANUAL_REVIEW and PENDING earn partial
 * credit (already in progress, not yet a liability); UNVERIFIED and
 * REJECTED earn none -- REJECTED deliberately scores identically to
 * UNVERIFIED rather than negative, since this signal only ever ADDS to a
 * candidate's rank (see lib/matching.ts's WEIGHTS.intelligence term), the
 * same way every other soft signal there works.
 */
function verificationFactor(status: VerificationStatus): number {
  switch (status) {
    case 'VERIFIED':
      return 1;
    case 'MANUAL_REVIEW':
      return 0.5;
    case 'PENDING':
      return 0.25;
    case 'UNVERIFIED':
    case 'REJECTED':
    default:
      return 0;
  }
}

/** 1 at RECENT_MATCH_CAP matches or more, tapering linearly from 0. */
function recentEngagementFactor(recentMatchCount: number): number {
  if (recentMatchCount <= 0) return 0;
  return clamp01(recentMatchCount / RECENT_MATCH_CAP);
}

/** 1 at zero days since active, falling linearly to 0 at RECENCY_TAPER_DAYS and beyond -- same shape as lib/matching.ts's proximityFactor/ageFitFactor. */
function recencyFactor(daysSinceLastActive: number): number {
  if (!Number.isFinite(daysSinceLastActive)) return 0;
  return Math.max(0, 1 - Math.max(0, daysSinceLastActive) / RECENCY_TAPER_DAYS);
}

/**
 * Pure, deterministic, 0..1 output. No I/O, no Date.now() -- every input
 * it needs is passed in, exactly the same "pure scoring function" contract
 * lib/matching.ts's scoreCandidate follows.
 */
export function computeIntelligenceSignal(inputs: IntelligenceSignalInputs): number {
  const completenessTerm = clamp01(inputs.completeness) * SIGNAL_WEIGHTS.completeness;
  const verificationTerm = verificationFactor(inputs.verification) * SIGNAL_WEIGHTS.verification;
  const engagementTerm = recentEngagementFactor(inputs.recentMatchCount) * SIGNAL_WEIGHTS.recentEngagement;
  const recencyTerm = recencyFactor(inputs.daysSinceLastActive) * SIGNAL_WEIGHTS.recency;

  return clamp01(completenessTerm + verificationTerm + engagementTerm + recencyTerm);
}

/**
 * The seam a possible future paid-AI provider would implement later --
 * same inputs (a batch of userIds), same output shape (userId -> 0..1
 * score), whatever it computes them from. Nothing here builds that
 * provider; this interface and rulesBasedProvider below are the whole of
 * Phase 3.
 */
export interface IntelligenceSignalProvider {
  computeBatch(userIds: string[]): Promise<Map<string, number>>;
}

// How many completeness "slots" count toward profileCompletenessFactor,
// and the cap on each count-based slot before it's treated as "full" --
// e.g. 3+ approved photos is already a complete-looking profile, a 4th or
// 40th photo shouldn't earn more credit than the 3rd. Picked to roughly
// mirror what the Profile creation flow already treats as a reasonably
// filled-out profile, not a hard product requirement.
const PHOTO_SLOT_CAP = 3;
const INTEREST_SLOT_CAP = 5;
const ANSWER_SLOT_CAP = 3;

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

type ProfileForCompleteness = {
  userId: string;
  bio: string;
  verification: VerificationStatus;
  interests: { id: string }[];
  answers: { id: string }[];
  photos: { id: string }[];
  user: { lastActiveAt: Date };
};

/**
 * 0..1 average of four equally-weighted, independently-capped slots: has a
 * bio, has approved photos, has interests, has answered prompts. Simple
 * and legible on purpose -- this is a rules engine, not a model; every
 * input is something already shown back to the profile's own owner on the
 * Profile screen today.
 */
function profileCompletenessFactor(p: ProfileForCompleteness): number {
  const hasBio = p.bio.trim().length > 0 ? 1 : 0;
  const photoSlot = clamp01(p.photos.length / PHOTO_SLOT_CAP);
  const interestSlot = clamp01(p.interests.length / INTEREST_SLOT_CAP);
  const answerSlot = clamp01(p.answers.length / ANSWER_SLOT_CAP);
  return (hasBio + photoSlot + interestSlot + answerSlot) / 4;
}

/**
 * Pulls today's real inputs for a batch of users and scores each one via
 * computeIntelligenceSignal. Three queries total, batched over the whole
 * userIds list -- never one query per user -- so this stays cheap to call
 * from a cron job over a few thousand ids at once (see
 * app/api/cron/intelligence-signal/route.ts).
 */
export const rulesBasedProvider: IntelligenceSignalProvider = {
  async computeBatch(userIds: string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (userIds.length === 0) return result;

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - THIRTY_DAYS_MS);

    const [profiles, recentMatches] = await Promise.all([
      db.profile.findMany({
        where: { userId: { in: userIds } },
        select: {
          userId: true,
          bio: true,
          verification: true,
          interests: { select: { id: true } },
          answers: { select: { id: true } },
          // Same "only what's actually visible/countable as a real,
          // approved photo" filter as everywhere else this app counts
          // photos -- a removed or still-pending photo shouldn't earn
          // completeness credit.
          photos: { where: { moderationStatus: 'APPROVED', removedAt: null }, select: { id: true } },
          user: { select: { lastActiveAt: true } },
        },
      }),
      db.match.findMany({
        where: {
          OR: [{ userAId: { in: userIds } }, { userBId: { in: userIds } }],
          createdAt: { gte: thirtyDaysAgo },
          unmatchedAt: null,
        },
        select: { userAId: true, userBId: true },
      }),
    ]);

    const recentMatchCountByUserId = new Map<string, number>();
    const bump = (userId: string) => recentMatchCountByUserId.set(userId, (recentMatchCountByUserId.get(userId) ?? 0) + 1);
    for (const m of recentMatches) {
      bump(m.userAId);
      bump(m.userBId);
    }

    for (const p of profiles) {
      const daysSinceLastActive = (now.getTime() - p.user.lastActiveAt.getTime()) / 86_400_000;
      const signal = computeIntelligenceSignal({
        completeness: profileCompletenessFactor(p),
        verification: p.verification,
        recentMatchCount: recentMatchCountByUserId.get(p.userId) ?? 0,
        daysSinceLastActive,
      });
      result.set(p.userId, signal);
    }

    return result;
  },
};
