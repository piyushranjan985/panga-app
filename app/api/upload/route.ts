import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { assertValidImage, uploadImage } from '@/lib/upload';

/**
 * Generic authenticated image upload — returns a URL, writes nothing to the
 * database. Used by onboarding's Photos step, where a Profile row doesn't
 * exist yet to attach a Photo to: the URLs collected here just ride along
 * in onboarding form state and get turned into real Photo rows all at once
 * when app/api/profile/route.ts's PUT handler saves the finished profile.
 * Once a profile exists, app/api/profile/photos/route.ts is used instead
 * (uploads AND creates the Photo row in one step).
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
    const url = await uploadImage(file, `onboarding/${session.userId}`);
    return NextResponse.json({ url });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Upload failed' }, { status: 400 });
  }
}
