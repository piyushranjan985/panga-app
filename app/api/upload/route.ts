import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { assertValidImage, normalizeImageForStorage, uploadImageBuffer } from '@/lib/upload';
import { moderateImageBuffer, photoRejectionMessage, manualReviewMessage } from '@/lib/safety/moderateAndUpload';

// Self-hosted image moderation (IMAGE_MODERATION_PROVIDER=self-hosted)
// runs two small CNNs on pure-JS tfjs (no native/WASM acceleration, see
// lib/safety/imageModeration.ts) -- slower than a native backend, so this
// route gets more time than a Vercel default function allows. 60s is the
// max most plans allow without Enterprise; if photo uploads still time
// out in practice, that's the next thing to address, not something more
// duration alone fixes.
export const maxDuration = 60;


/**
 * Generic authenticated image upload — returns a URL, writes nothing to the
 * database. Used by onboarding's Photos step, where a Profile row doesn't
 * exist yet to attach a Photo to: the URLs collected here just ride along
 * in onboarding form state and get turned into real Photo rows all at once
 * when app/api/profile/route.ts's PUT handler saves the finished profile.
 * Once a profile exists, app/api/profile/photos/route.ts is used instead
 * (uploads AND creates the Photo row in one step).
 *
 * Moderation happens twice for an onboarding photo, deliberately: once
 * here (REJECTED content is refused a URL at all -- "never trust the
 * client" means we don't trust that a URL collected here and handed back
 * to us later in the PUT body is still the same, unmodified image), and
 * again in app/api/profile/route.ts when the Photo rows are actually
 * created, which is what persists the real PhotoModerationResult/
 * moderationStatus. See docs/IDENTITY_VERIFICATION_AND_SAFETY.md
 * sections 1, 4, 7.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const formData = await req.formData().catch(() => null);
  const file = formData?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  try {
    assertValidImage(file);
    const buffer = Buffer.from(await file.arrayBuffer());
    const outcome = await moderateImageBuffer(buffer);

    if (outcome.decision === 'REJECTED') {
      return NextResponse.json({ error: photoRejectionMessage(outcome) }, { status: 400 });
    }

    const normalized = await normalizeImageForStorage(buffer, file.type);
    const url = await uploadImageBuffer(normalized, `onboarding/${session.userId}`);
    return NextResponse.json({
      url,
      // MANUAL_REVIEW is still a successful upload (never rejected outright)
      // but the uploader should know now, not discover it later as an
      // unexplained "Under review" badge -- see manualReviewMessage's doc
      // comment.
      notice: outcome.decision === 'MANUAL_REVIEW' ? manualReviewMessage(outcome) : null,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Upload failed' }, { status: 400 });
  }
}
