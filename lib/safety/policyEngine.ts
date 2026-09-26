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
 *
 * SCOPE NOTE (2026-09-26): selfie-vs-ID-document face matching was
 * explicitly descoped by product decision -- there is no verified-selfie
 * embedding anywhere in this app, and there never will be unless that
 * decision is revisited. This engine no longer reasons about a "matched
 * verified face" signal at all. The direct consequence, stated plainly:
 * a clean single-face photo is auto-approved on face presence and nudity
 * scores alone -- nothing here confirms the face belongs to the account's
 * verified identity. That means someone could pass identity verification
 * with their own ID and then upload a photo of a different person's face.
 * DigiLocker verification and photo moderation are therefore two
 * independent checks (both mandatory), not a linked "is this really you"
 * guarantee. See docs/IDENTITY_VERIFICATION_AND_SAFETY.md section 3 for
 * the full writeup of this trade-off.
 */

export type PhotoModerationDecision = 'APPROVED' | 'REJECTED' | 'MANUAL_REVIEW';

export interface ModerationSignals {
  faceCount: number;
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

  // More than one face -- ambiguous which one is the account owner with
  // no face-match signal to resolve it (see the scope note above), so a
  // human decides rather than auto-approving a group photo.
  if (signals.faceCount > 1) {
    reasons.push('multiple_faces_unresolved');
    return { decision: 'MANUAL_REVIEW', reasons };
  }

  // Exactly one clean human face, nudity scores under the reject
  // threshold. This is the auto-approve path -- see the scope note at the
  // top of this file for exactly what this does and doesn't guarantee.
  return reasons.length > 0 ? { decision: 'MANUAL_REVIEW', reasons } : { decision: 'APPROVED', reasons: [] };
}
