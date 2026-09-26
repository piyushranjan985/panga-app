import { db } from '@/lib/db';
import { evaluatePhoto, type PhotoModerationDecision } from './policyEngine';
import { getImageModerationProvider } from './imageModeration';

export interface ModerationOutcome {
  decision: PhotoModerationDecision;
  reasons: string[];
  provider: string;
  modelVersion: string;
  faceDetected: boolean;
  faceCount: number;
  matchedVerifiedFace: boolean | null;
  nudityScore: number; // max(porn, hentai, sexy) -- single number for the Photo-list admin view; full breakdown lives in `raw`
  raw: { porn: number; hentai: number; sexy: number };
}

/**
 * Pure analysis: runs the configured provider, then the policy engine, on
 * a single image buffer. No DB or storage side effects -- callers decide
 * what to do with the result (reject before ever uploading, or persist a
 * PhotoModerationResult against an existing Photo row). See
 * docs/IDENTITY_VERIFICATION_AND_SAFETY.md sections 1, 4, 6.
 *
 * `verifiedFaceEmbedding` is optional and, for now, always omitted by
 * every call site -- it starts being populated once
 * lib/safety/identityVerification.ts (Phase 2B, not yet built) exists and
 * stores a verified selfie embedding per user. Until then every photo with
 * a detected face lands in MANUAL_REVIEW rather than auto-APPROVED, which
 * is the correct, conservative default for a feature that isn't fully
 * wired up yet -- not a bug to "fix" by faking a match.
 */
export async function moderateImageBuffer(
  imageBuffer: Buffer,
  opts?: { verifiedFaceEmbedding?: number[] | null },
): Promise<ModerationOutcome> {
  const provider = getImageModerationProvider();

  let signals;
  try {
    signals = await provider.analyze(imageBuffer, opts);
  } catch (err) {
    // Fail safe, loudly: a provider error (e.g. self-hosted models
    // misconfigured -- see imageModeration.ts's setup steps) never means
    // "treat as clean" -- it means "a human needs to look at this."
    console.error('[moderateImageBuffer] provider analysis failed, routing to MANUAL_REVIEW', err);
    return {
      decision: 'MANUAL_REVIEW',
      reasons: ['moderation_provider_error'],
      provider: provider.name,
      modelVersion: provider.modelVersion,
      faceDetected: false,
      faceCount: 0,
      matchedVerifiedFace: null,
      nudityScore: 0,
      raw: { porn: 0, hentai: 0, sexy: 0 },
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
    matchedVerifiedFace: signals.matchedVerifiedFace,
    nudityScore: Math.max(signals.nudityScores.porn, signals.nudityScores.hentai, signals.nudityScores.sexy),
    raw: signals.nudityScores,
  };
}

const CATEGORY_FOR_REASONS = (reasons: string[]): string =>
  reasons.includes('explicit_content_detected') ? 'sexual_content' : 'photo_violation';

const SEVERITY_FOR_DECISION = (decision: PhotoModerationDecision): 'LOW' | 'MEDIUM' | 'HIGH' =>
  decision === 'REJECTED' ? 'HIGH' : 'LOW';

/**
 * Persists an already-computed ModerationOutcome against a Photo row:
 * writes the PhotoModerationResult history row, updates
 * Photo.moderationStatus/moderatedAt, and -- for anything other than a
 * clean APPROVED -- opens a ModerationCase so it shows up in the admin
 * Photo Moderation Queue (see docs/IDENTITY_VERIFICATION_AND_SAFETY.md
 * section 9; that queue UI itself is Phase 2C, not yet built, but cases
 * opened now will already be waiting in it once it exists).
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
        matchedVerifiedFace: outcome.matchedVerifiedFace,
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
