import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { deleteImage } from '@/lib/upload';

const MIN_PHOTOS = 1;

// Removes one photo from the signed-in user's own profile. Ownership is
// checked by looking the photo up through the caller's own profile rather
// than trusting photoId alone, and the last remaining photo can't be
// deleted — every profile keeps at least MIN_PHOTOS.
export async function DELETE(_req: Request, { params }: { params: Promise<{ photoId: string }> }) {
  const { photoId } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.userId }, include: { photos: true } });
  if (!profile) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const photo = profile.photos.find((p) => p.id === photoId);
  if (!photo) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (profile.photos.length <= MIN_PHOTOS) {
    return NextResponse.json({ error: `You need at least ${MIN_PHOTOS} photo` }, { status: 400 });
  }

  await db.photo.delete({ where: { id: photoId } });
  await deleteImage(photo.url);

  // A still-open moderation case about this exact photo (REJECTED or
  // MANUAL_REVIEW -- see lib/safety/moderateAndUpload.ts's
  // recordPhotoModeration, which opens one for most outcomes short of an
  // outright APPROVED -- though not for a REJECTED decision with nothing
  // left to review in the first place, see its NO_REVIEW_NEEDED_REASONS)
  // has nothing left to review once its photo is gone. Left alone, it
  // just sits in admin's open queue forever, pointing at a deleted row --
  // auto-close it rather than leave that for an admin to notice and clear
  // by hand. A no-op (updateMany matches zero rows) when no case was ever
  // opened for this photo. Best-effort: this must never fail (or block)
  // the person's own delete, which already succeeded above.
  //
  // Deliberately DISMISSED, not deleted -- the case row itself stays for
  // history (isRepeatOffender's count, a few lines up in that same file,
  // counts every case regardless of status, so this doesn't erase that
  // signal, just takes it out of the queue).
  try {
    await db.moderationCase.updateMany({
      where: {
        subjectUserId: session.userId,
        category: { in: ['photo_violation', 'sexual_content'] },
        status: { in: ['OPEN', 'IN_REVIEW', 'ESCALATED'] },
        evidence: { path: ['photoId'], equals: photoId },
      },
      data: {
        status: 'DISMISSED',
        resolution: 'Auto-closed: the photo this case was about was deleted by its owner before review.',
        resolvedAt: new Date(),
      },
    });
  } catch (err) {
    console.error('[profile/photos] auto-closing moderation case(s) for deleted photo failed', { photoId, err });
  }

  return NextResponse.json({ ok: true });
}

// Lets the signed-in user pick any of their own APPROVED photos to be
// "primary" (position 0) -- the one app/profile/page.tsx's header avatar
// and "Primary" badge show, and the one every viewer-facing query
// (Discover, matches, previews) picks first once it's live to others.
// Restricted to APPROVED: PENDING/MANUAL_REVIEW aren't visible to anyone
// yet and REJECTED never will be (its blob is already gone -- see
// resolvePendingPhotoModeration), so neither makes sense as "primary".
//
// Implemented as a straight position swap with whichever photo currently
// holds position 0, not a full renumbering -- cheaper, and it preserves
// the relative order of every other photo exactly as the person left it.
export async function PATCH(req: Request, { params }: { params: Promise<{ photoId: string }> }) {
  const { photoId } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const json = await req.json().catch(() => null);
  if (json?.action !== 'make_primary') {
    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  }

  const profile = await db.profile.findUnique({
    where: { userId: session.userId },
    include: { photos: { orderBy: { position: 'asc' } } },
  });
  if (!profile) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const target = profile.photos.find((p) => p.id === photoId);
  if (!target) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (target.moderationStatus !== 'APPROVED') {
    return NextResponse.json({ error: 'Only an approved photo can be made primary' }, { status: 400 });
  }

  // "Position 0" rather than a literal position === 0 lookup -- deleting
  // the original first photo leaves a gap (DELETE above never
  // renumbers), so the current primary is whichever photo sorts first,
  // not necessarily the one at position 0 exactly.
  const currentPrimary = profile.photos[0];
  if (currentPrimary && currentPrimary.id !== target.id) {
    await db.$transaction([
      db.photo.update({ where: { id: target.id }, data: { position: currentPrimary.position } }),
      db.photo.update({ where: { id: currentPrimary.id }, data: { position: target.position } }),
    ]);
  }

  const photos = await db.photo.findMany({ where: { profileId: profile.id }, orderBy: { position: 'asc' } });
  return NextResponse.json({ ok: true, photos });
}
