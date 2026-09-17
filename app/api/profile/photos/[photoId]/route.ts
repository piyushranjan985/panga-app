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

  return NextResponse.json({ ok: true });
}
