import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { assertValidImage, normalizeImageForStorage, uploadImageBuffer } from '@/lib/upload';

/**
 * Generic authenticated image upload — returns a URL, writes nothing to the
 * database. Used by onboarding's Photos step, where a Profile row doesn't
 * exist yet to attach a Photo to: the URLs collected here just ride along
 * in onboarding form state and get turned into real Photo rows all at once
 * when app/api/profile/route.ts's PUT handler saves the finished profile.
 * Once a profile exists, app/api/profile/photos/route.ts is used instead
 * (uploads AND creates the Photo row in one step).
 *
 * No moderation happens here any more (it used to, inline, synchronously
 * -- see docs/IDENTITY_VERIFICATION_AND_SAFETY.md S11 for why that
 * changed). Moderation now happens exactly once, asynchronously, the
 * moment a real Photo row exists for this URL -- app/api/profile/route.ts's
 * PUT handler creates that row and enqueues it (lib/safety/moderationQueue.ts).
 * This isn't a weaker check than before: that PUT handler never trusted a
 * client-supplied URL as "already checked" anyway (same "never trust the
 * client" reasoning this comment used to describe), it just used to
 * re-check inline instead of handing off -- so there's one moderation
 * pass either way, just later and off this request's critical path.
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
    const normalized = await normalizeImageForStorage(buffer, file.type);
    const url = await uploadImageBuffer(normalized, `onboarding/${session.userId}`);
    return NextResponse.json({ url });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Upload failed' }, { status: 400 });
  }
}
