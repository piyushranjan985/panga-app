import { db } from '@/lib/db';
import { evaluatePhoto, type PhotoModerationDecision } from './policyEngine';
import { getImageModerationProvider, UndecodableImageError } from './imageModeration';

export interface ModerationOutcome {
  decision: PhotoModerationDecision;
  reasons: string[];
  provider: string;
  modelVersion: string;
  faceDetected: boolean;
  faceCount: number;
  nudityScore: number; // max(porn, hentai, sexy) -- single number for the Photo-list admin view; full breakdown lives in `raw`
  raw: { porn: number; hentai: number; sexy: number };
  // Only set for reasons: ['moderation_unavailable'] -- the actual thrown
  // error's message, for the server log only (see moderateImageBuffer's
  // catch block). This decision is now a hard REJECTED (see that block's
  // comment for why), which never opens a ModerationCase -- so unlike the
  // other REJECTED reasons this text has nowhere to surface in the admin
  // UI either. It exists purely so a `console.error` grep in the deploy
  // logs shows a real message, not a guess. Never shown to the uploader.
  errorDetail?: string;
}

/**
 * Pure analysis: runs the configured provider, then the policy engine, on
 * a single image buffer. No DB or storage side effects -- callers decide
 * what to do with the result (reject before ever uploading, or persist a
 * PhotoModerationResult against an existing Photo row). See
 * docs/IDENTITY_VERIFICATION_AND_SAFETY.md sections 1, 4, 6.
 *
 * No `verifiedFaceEmbedding` option -- selfie-vs-ID face matching was
 * descoped, see the note at the top of policyEngine.ts. A clean
 * single-face photo with acceptable nudity scores is auto-approved on
 * that basis alone.
 */
export async function moderateImageBuffer(imageBuffer: Buffer): Promise<ModerationOutcome> {
  const provider = getImageModerationProvider();

  let signals;
  try {
    signals = await provider.analyze(imageBuffer);
  } catch (err) {
    if (err instanceof UndecodableImageError) {
      // Not "our infra is broken" -- "this file isn't a photo we can
      // analyze at all" (corrupt, or a format neither sharp nor
      // heic-convert understands). Nothing for a human reviewer to look
      // at, so reject outright rather than routing to MANUAL_REVIEW --
      // see imageModeration.ts's DECODE HISTORY note for why this
      // distinction exists (an earlier version conflated the two and
      // that's exactly how an undecodable photo once sailed through).
      console.warn('[moderateImageBuffer] image could not be decoded, rejecting upload', err.message);
      return {
        decision: 'REJECTED',
        reasons: ['unsupported_or_corrupt_image'],
        provider: provider.name,
        modelVersion: provider.modelVersion,
        faceDetected: false,
        faceCount: 0,
        nudityScore: 0,
        raw: { porn: 0, hentai: 0, sexy: 0 },
      };
    }
    // Product decision (2026-09-26): any OTHER provider error (e.g.
    // self-hosted models misconfigured -- see imageModeration.ts's setup
    // steps) used to fail safe to MANUAL_REVIEW ("we don't know, a human
    // should look") rather than treat a crash as "this photo is clean."
    // That reasoning still holds in the abstract, but in practice there's
    // no actively-staffed queue watching MANUAL_REVIEW cases, so a photo
    // stuck there because the analysis pipeline itself broke just sits
    // invisible to other users indefinitely -- functionally identical to
    // "no face detected" from the uploader's side, except unexplained and
    // unresolvable by them. Reject outright instead, exactly like a
    // confirmed no-face photo (see policyEngine.ts's faceCount === 0
    // branch): the uploader gets a clear, immediate message and can just
    // retry, which is the right answer for what's usually a transient
    // failure anyway (see next.config.mjs's outputFileTracingIncludes
    // comment for the specific bug this was covering for). No
    // ModerationCase gets opened for this reason any more -- see
    // recordPhotoModeration, which only ever runs for a Photo row that
    // was actually created, and a REJECTED photo never is.
    console.error('[moderateImageBuffer] provider analysis failed, rejecting upload', err);
    return {
      decision: 'REJECTED',
      reasons: ['moderation_unavailable'],
      provider: provider.name,
      modelVersion: provider.modelVersion,
      faceDetected: false,
      faceCount: 0,
      nudityScore: 0,
      raw: { porn: 0, hentai: 0, sexy: 0 },
      errorDetail: err instanceof Error ? err.message : String(err),
    };
  }

  const result = evaluatePhoto(signals);
  return {
    decision: result.decision,
    reasons: result.reasons,
    provider: provider.name,
    modelVersion: provider.modelVersion,
    faceDetected: signals.faceCount > 0,
    faceCount: signals.faceCount,
    nudityScore: Math.max(signals.nudityScores.porn, signals.nudityScores.hentai, signals.nudityScores.sexy),
    raw: signals.nudityScores,
  };
}

const CATEGORY_FOR_REASONS = (reasons: string[]): string =>
  reasons.includes('explicit_content_detected') ? 'sexual_content' : 'photo_violation';

/**
 * A single, friendly, reason-specific message for a REJECTED outcome --
 * used by every upload route so "no face" / "explicit content" / "we
 * couldn't read this file" don't all collapse into one generic sentence
 * that tells the user nothing about what to actually do differently.
 */
export function photoRejectionMessage(outcome: ModerationOutcome): string {
  if (outcome.reasons.includes('unsupported_or_corrupt_image')) {
    return "We couldn't read that image file. Please try a different photo (JPG, PNG, HEIC, and WebP are all supported).";
  }
  if (outcome.reasons.includes('moderation_unavailable')) {
    return "We couldn't verify that photo just now. Please try uploading it again in a moment.";
  }
  if (outcome.reasons.includes('explicit_content_detected')) {
    return "This photo doesn't meet findmyVybe's photo guidelines.";
  }
  if (outcome.reasons.includes('no_face_detected')) {
    return "We couldn't find a clear human face in that photo — please upload a photo that clearly shows your face.";
  }
  return "This photo doesn't meet findmyVybe's photo guidelines — try a clear photo of your face instead.";
}

/**
 * The upload-time counterpart to photoRejectionMessage: a photo that
 * wasn't rejected but also isn't auto-approved (MANUAL_REVIEW) used to be
 * accepted with zero feedback at all -- the uploader would find out only
 * later, from the "Under review" badge on their own profile grid, which
 * read as a silent bug rather than an explained pending state. Every
 * upload route now surfaces this string alongside a successful response
 * whenever outcome.decision === 'MANUAL_REVIEW', so the person sees it
 * the moment they upload, not minutes later.
 */
export function manualReviewMessage(outcome: ModerationOutcome): string {
  // A provider crash is a hard REJECTED now (see moderateImageBuffer's
  // catch block), so it can never reach this function -- MANUAL_REVIEW at
  // this point always means a real, ambiguous content signal (borderline
  // nudity score, more than one face) that genuinely needs a human's
  // judgment call, not a system failure standing in for one.
  if (outcome.reasons.includes('multiple_faces_unresolved')) {
    return 'Your photo was uploaded. Since it shows more than one face, a person on our team will take a quick look before it\'s shown to others.';
  }
  return "Your photo was uploaded and a person on our team will take a quick look before it's shown to others.";
}

const SEVERITY_FOR_DECISION = (decision: PhotoModerationDecision): 'LOW' | 'MEDIUM' | 'HIGH' =>
  decision === 'REJECTED' ? 'HIGH' : 'LOW';

/**
 * Persists an already-computed ModerationOutcome against a Photo row:
 * writes the PhotoModerationResult history row, updates
 * Photo.moderationStatus/moderatedAt, and -- for anything other than a
 * clean APPROVED -- opens a ModerationCase so it shows up in the admin
 * moderation queue (admin/app/(console)/moderation/page.tsx already
 * surfaces these with no changes needed -- its default view shows all
 * OPEN/IN_REVIEW/ESCALATED cases regardless of category).
 */
export async function recordPhotoModeration(params: {
  photoId: string;
  subjectUserId: string;
  outcome: ModerationOutcome;
}): Promise<void> {
  const { photoId, subjectUserId, outcome } = params;

  let moderationCaseId: string | undefined;
  if (outcome.decision !== 'APPROVED') {
    const priorCases = await db.moderationCase.count({
      where: { subjectUserId, category: { in: ['photo_violation', 'sexual_content'] } },
    });
    const created = await db.moderationCase.create({
      data: {
        subjectUserId,
        sourceType: 'AUTOMATED_FLAG',
        category: CATEGORY_FOR_REASONS(outcome.reasons),
        severity: SEVERITY_FOR_DECISION(outcome.decision),
        status: 'OPEN',
        isRepeatOffender: priorCases > 0,
        evidence: {
          photoId,
          decision: outcome.decision,
          reasons: outcome.reasons,
          provider: outcome.provider,
          modelVersion: outcome.modelVersion,
          faceCount: outcome.faceCount,
          nudityScore: outcome.nudityScore,
          ...(outcome.errorDetail ? { errorDetail: outcome.errorDetail } : {}),
        },
      },
    });
    moderationCaseId = created.id;
  }

  await db.$transaction([
    db.photoModerationResult.create({
      data: {
        photoId,
        decision: outcome.decision,
        faceDetected: outcome.faceDetected,
        faceCount: outcome.faceCount,
        matchedVerifiedFace: null,
        nudityScore: outcome.nudityScore,
        provider: outcome.provider,
        modelVersion: outcome.modelVersion,
        moderationCaseId,
      },
    }),
    db.photo.update({
      where: { id: photoId },
      data: { moderationStatus: outcome.decision, moderatedAt: new Date() },
    }),
  ]);
}

/**
 * Fetches an already-uploaded image (a Vercel Blob URL, typically one
 * collected during onboarding via app/api/upload/route.ts) and runs the
 * same analysis a direct file upload would get. Used by
 * app/api/profile/route.ts's PUT handler, which is where onboarding's
 * collected photoUrls actually turn into Photo rows -- re-checking here
 * (rather than trusting the URL's earlier upload-time check) is
 * deliberate: "never trust the client" applies to a URL string in a PUT
 * body exactly as much as it applies to a raw file upload, since nothing
 * stops a client from submitting a URL app/api/upload/route.ts never
 * actually returned.
 */
export async function moderateImageUrl(url: string): Promise<ModerationOutcome> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Could not fetch photo for moderation (${res.status})`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return moderateImageBuffer(buffer);
}
