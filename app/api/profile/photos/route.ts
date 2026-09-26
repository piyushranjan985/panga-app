import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { assertValidImage, uploadImage } from '@/lib/upload';
import { moderateImageBuffer, recordPhotoModeration } from '@/lib/safety/moderateAndUpload';

const MAX_PHOTOS = 5;

/**
 * Add a photo to an already-onboarded profile (the profile settings
 * screen's "+ Add" tile). Onboarding uses app/api/upload/route.ts instead,
 * since a Profile row doesn't exist yet at that point to attach a Photo to.
 *
 * Every photo goes through lib/safety/moderateAndUpload.ts before it's
 * ever stored -- see docs/IDENTITY_VERIFICATION_AND_SAFETY.md sections 1,
 * 4. A REJECTED image is never uploaded to blob storage at all (no public
 * URL ever exists for it); MANUAL_REVIEW and APPROVED are both stored, but
 * only APPROVED photos are ever shown to another user (see
 * app/api/discover/route.ts and app/api/profile/[userId]/... photo
 * filtering, which reads Photo.moderationStatus).
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
    const outcome = await moderateImageBuffer(buffer);

    if (outcome.decision === 'REJECTED') {
      return NextResponse.json(
        { error: "This photo doesn't meet findmyVybe's photo guidelines — try a clear photo of your face instead." },
        { status: 400 },
      );
    }

    const url = await uploadImage(file, `profiles/${session.userId}`);
    const nextPosition = profile.photos.reduce((max, p) => Math.max(max, p.position), -1) + 1;
    const photo = await db.photo.create({
      data: { profileId: profile.id, url, position: nextPosition, moderationStatus: outcome.decision, moderatedAt: new Date() },
    });
    await recordPhotoModeration({ photoId: photo.id, subjectUserId: session.userId, outcome });

    return NextResponse.json({ ok: true, photo });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Upload failed' }, { status: 400 });
  }
}
