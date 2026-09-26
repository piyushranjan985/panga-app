/**
 * Turns a ModerationCase's raw `evidence` JSON blob into something an
 * admin can actually act on. Before this, the case detail page just
 * dumped `JSON.stringify(evidence, null, 2)` into a <pre> -- for a photo
 * case that meant reason *codes* with no picture of the photo itself
 * (an admin had to separately look up the user and guess which of their
 * photos was flagged), and for every case it meant reading application
 * internals (`moderation_provider_error`, `dob_unavailable`) instead of
 * a sentence describing what actually happened.
 *
 * Deliberately permissive about shape: `evidence` is Prisma `Json`
 * (untyped), written by two different call sites today
 * (lib/safety/moderateAndUpload.ts for photos, lib/safety/
 * identityVerification.ts for ID checks) and potentially more in the
 * future -- every accessor here guards its own field before using it, and
 * the case detail page keeps the raw JSON dump too (in a <details>), so
 * nothing is ever hidden, only additionally explained.
 */

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

const PHOTO_REASON_LABELS: Record<string, string> = {
  moderation_provider_error:
    '⚠️ Automated review failed to run (system error) -- this is NOT a content flag. View the photo and decide manually.',
  borderline_content_needs_review: 'Possible mature/suggestive content (borderline score) -- needs a human judgment call.',
  multiple_faces_unresolved: "Multiple faces detected -- no automated way to tell which one is the account owner.",
  no_face_detected: 'No human face detected.',
  explicit_content_detected: 'Explicit content detected.',
  unsupported_or_corrupt_image: 'Image file could not be read (unsupported or corrupt format).',
};

export function humanizePhotoReason(reason: string): string {
  return PHOTO_REASON_LABELS[reason] ?? reason.replace(/_/g, ' ');
}

const IDENTITY_FAILURE_LABELS: Record<string, string> = {
  duplicate_identity: 'This government ID is already linked to a different account.',
  underage: "Document's date of birth indicates the user is under 18 — hard stop, no self-service retry available to them.",
  dob_unavailable: 'Could not read a date of birth from the document at all.',
  dob_mismatch: "Document's date of birth doesn't match what the user entered in their profile.",
  name_mismatch: "Document's name shares no word with the profile's display name — possible catfishing signal.",
};

export function humanizeIdentityFailure(reason: string | null | undefined): string {
  if (!reason) return 'No specific reason recorded.';
  return IDENTITY_FAILURE_LABELS[reason] ?? reason.replace(/_/g, ' ');
}

export interface PhotoEvidence {
  photoId: string;
  decision: string | null;
  reasons: string[];
  provider: string | null;
  modelVersion: string | null;
  faceCount: number | null;
  nudityScore: number | null;
  errorDetail: string | null;
}

/** Recognizes the shape lib/safety/moderateAndUpload.ts's recordPhotoModeration writes. */
export function asPhotoEvidence(evidence: unknown): PhotoEvidence | null {
  const rec = asRecord(evidence);
  if (!rec || typeof rec.photoId !== 'string') return null;
  const reasons = Array.isArray(rec.reasons) ? rec.reasons.filter((r): r is string => typeof r === 'string') : [];
  return {
    photoId: rec.photoId,
    decision: str(rec.decision),
    reasons,
    provider: str(rec.provider),
    modelVersion: str(rec.modelVersion),
    faceCount: typeof rec.faceCount === 'number' ? rec.faceCount : null,
    nudityScore: typeof rec.nudityScore === 'number' ? rec.nudityScore : null,
    errorDetail: str(rec.errorDetail),
  };
}

export interface IdentityEvidence {
  documentType: string | null;
  referenceMasked: string | null;
  failureReason: string | null;
  duplicateOfUserId: string | null;
  ageStatus: string | null;
  nameMatchesProfile: boolean | null;
}

/** Recognizes the shape lib/safety/identityVerification.ts's finalizeIdentityVerification writes. */
export function asIdentityEvidence(evidence: unknown): IdentityEvidence | null {
  const rec = asRecord(evidence);
  if (!rec || typeof rec.documentType !== 'string') return null;
  return {
    documentType: str(rec.documentType),
    referenceMasked: str(rec.referenceMasked),
    failureReason: str(rec.failureReason),
    duplicateOfUserId: str(rec.duplicateOfUserId),
    ageStatus: str(rec.ageStatus),
    nameMatchesProfile: typeof rec.nameMatchesProfile === 'boolean' ? rec.nameMatchesProfile : null,
  };
}
