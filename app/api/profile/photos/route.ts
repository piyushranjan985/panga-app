import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { assertValidImage, normalizeImageForStorage, uploadImageBuffer, deleteImage } from '@/lib/upload';
import { moderateImageBuffer, recordPhotoModeration } from '@/lib/safety/moderateAndUpload';
import { enqueuePhotoModeration } from '@/lib/safety/moderationQueue';

// Kept at 5 -- Bumble/Hinge standardize on 6 and Tinder allows 9 (see
// docs/DATA_RETENTION.md S6 for the competitor research), but 5 was a
// deliberate choice to keep here, not changed.
const MAX_PHOTOS = 5;

/**
 * Add a photo to an already-onboarded profile (the profile settings
 * screen's "+ Add" tile). Onboarding uses app/api/upload/route.ts instead,
 * since a Profile row doesn't exist yet at that point to attach a Photo to.
 *
 * The photo is stored and the Photo row created immediately (moderationStatus:
 * PENDING, the schema default), and moderation is handed off to run
 * asynchronously (lib/safety/moderationQueue.ts) rather than inline here --
 * see docs/IDENTITY_VERIFICATION_AND_SAFETY.md S11. This route used to
 * block on the self-hosted nsfwjs+face-api analysis and refuse to even
 * store a REJECTED photo; now every upload succeeds immediately and the
 * uploader finds out the actual verdict via notification shortly after
 * (push + email, see app/api/cron/moderate-photo/route.ts). A REJECTED
 * result still never ends up visible to anyone else -- PENDING is
 * excluded from every viewer-facing query exactly like MANUAL_REVIEW
 * already was, and a REJECTED photo gets its blob deleted and the row
 * soft-removed the moment the async check resolves.
 *
 * If QStash isn't configured (enqueuePhotoModeration returns false --
 * e.g. local dev without QSTASH_TOKEN), this falls back to the old
 * inline, synchronous check right here so nothing ships un-moderated;
 * that's the only case where this request's duration still depends on
 * the analysis.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.userId }, include: { photos: true } });
  if (!profile) return NextResponse.json({ error: 'Finish onboarding first' }, { status: 409 });
  if (profile.photos.length >= MAX_PHOTOS) {
    return NextResponse.json({ error: `You can have up to ${MAX_PHOTOS} photos` }, { status: 400 });
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  try {
    assertValidImage(file);
    const buffer = Buffer.from(await file.arrayBuffer());
    const normalized = await normalizeImageForStorage(buffer, file.type);
    const url = await uploadImageBuffer(normalized, `profiles/${session.userId}`);
    const nextPosition = profile.photos.reduce((max, p) => Math.max(max, p.position), -1) + 1;
    const photo = await db.photo.create({
      data: { profileId: profile.id, url, position: nextPosition },
    });

    const queued = await enqueuePhotoModeration(photo.id);
    if (!queued) {
      // QStash isn't configured (e.g. local dev) -- fall back to the old
      // inline, synchronous check so this photo still actually gets
      // moderated. Mirrors app/api/cron/moderate-photo/route.ts's own
      // REJECTED handling: scrub the blob, same as that worker does.
      const outcome = await moderateImageBuffer(buffer);
      await recordPhotoModeration({ photoId: photo.id, subjectUserId: session.userId, outcome });
      if (outcome.decision === 'REJECTED') {
        await deleteImage(url);
      }
    }

    return NextResponse.json({
      ok: true,
      photo,
      notice: "We're verifying this photo now -- you'll get a notification once it's approved, usually within a few minutes.",
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Upload failed' }, { status: 400 });
  }
}
