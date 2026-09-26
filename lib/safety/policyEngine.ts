/**
 * Pure decision logic for photo moderation -- deliberately has zero
 * dependencies on Prisma, Next.js, or any moderation provider, so it can be
 * unit-tested with plain mocked inputs (see
 * docs/IDENTITY_VERIFICATION_AND_SAFETY.md section 13: tests feed this
 * fake scores, never real explicit images).
 *
 * imageModeration.ts calls this after running the actual analysis; nothing
 * else in the app should hand-roll an APPROVED/REJECTED/MANUAL_REVIEW
 * decision -- this is the one place that logic lives.
 */

export type PhotoModerationDecision = 'APPROVED' | 'REJECTED' | 'MANUAL_REVIEW';

export interface ModerationSignals {
  faceCount: number;
  // Did a detected face match the account's verified-selfie embedding?
  // `null` when the account has no verified selfie yet (e.g. verification
  // hasn't happened), which is a normal state, not a failure.
  matchedVerifiedFace: boolean | null;
  // nsfwjs-style category scores, each 0..1. Only the categories the
  // policy actually reasons about are required; a provider can return more.
  nudityScores: {
    porn: number;
    hentai: number;
    sexy: number;
  };
}

export interface PolicyThresholds {
  pornRejectAbove: number;
  hentaiRejectAbove: number;
  sexyReviewAbove: number;
}

// Defaults live here, not scattered across call sites. Per
// docs/IDENTITY_VERIFICATION_AND_SAFETY.md section 9, these should become
// admin-configurable (FeatureFlag/config) rather than hardcoded before
// launch -- this export is exactly what that config would override.
export const DEFAULT_THRESHOLDS: PolicyThresholds = {
  pornRejectAbove: 0.85,
  hentaiRejectAbove: 0.85,
  sexyReviewAbove: 0.6,
};

export interface PolicyResult {
  decision: PhotoModerationDecision;
  reasons: string[];
}

/**
 * The one function that turns raw signals into a decision. Every branch
 * below traces back to a specific requirement in
 * docs/IDENTITY_VERIFICATION_AND_SAFETY.md sections 2-4 -- see the inline
 * comments for which one.
 */
export function evaluatePhoto(
  signals: ModerationSignals,
  thresholds: PolicyThresholds = DEFAULT_THRESHOLDS,
): PolicyResult {
  const reasons: string[] = [];

  // Explicit content -- zero tolerance, but borderline ("Sexy") goes to a
  // human rather than an automated hard reject, since that category is
  // the one most prone to false positives on ordinary photos (swimwear,
  // gym pictures, etc.) per nsfwjs's own documented behavior.
  if (signals.nudityScores.porn >= thresholds.pornRejectAbove) {
    return { decision: 'REJECTED', reasons: ['explicit_content_detected'] };
  }
  if (signals.nudityScores.hentai >= thresholds.hentaiRejectAbove) {
    return { decision: 'REJECTED', reasons: ['explicit_content_detected'] };
  }
  if (signals.nudityScores.sexy >= thresholds.sexyReviewAbove) {
    reasons.push('borderline_content_needs_review');
  }

  // No detectable human face -- rejects landscapes, objects, logos, pure
  // illustrations/cartoons (nsfwjs's own "Drawing" category feeds into a
  // provider's nudityScores.hentai/porn only for actual drawn nudity; a
  // clean illustration is caught here, by having no real face, not by a
  // separate "is this a cartoon" classifier this budget doesn't have).
  if (signals.faceCount === 0) {
    return { decision: 'REJECTED', reasons: ['no_face_detected'] };
  }

  // A face is present and matches the account's verified selfie -- the
  // strongest possible signal, approve outright regardless of face count
  // (covers the "group photo, account owner identifiable" case explicitly
  // allowed by the spec).
  if (signals.matchedVerifiedFace === true) {
    return reasons.length > 0
      ? { decision: 'MANUAL_REVIEW', reasons }
      : { decision: 'APPROVED', reasons: [] };
  }

  // A face is present but didn't match (or verification hasn't happened
  // yet to compare against) -- proceed only for the simple single-face
  // case; multiple unmatched faces can't be resolved automatically (which
  // one is the account owner?) so it goes to a human. This is also the
  // practical backstop against AI-generated/deepfake photos noted as a
  // known gap in docs/IDENTITY_VERIFICATION_AND_SAFETY.md section 3: a
  // synthetic face won't match the real verified person either.
  if (signals.faceCount > 1) {
    reasons.push('multiple_faces_unmatched');
    return { decision: 'MANUAL_REVIEW', reasons };
  }

  if (signals.matchedVerifiedFace === null) {
    reasons.push('no_verified_face_to_compare');
    return { decision: 'MANUAL_REVIEW', reasons };
  }

  // Exactly one face, didn't match a verified selfie that does exist.
  reasons.push('face_did_not_match_verification');
  return { decision: 'MANUAL_REVIEW', reasons };
}
