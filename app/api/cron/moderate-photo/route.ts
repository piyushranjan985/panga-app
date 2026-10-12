import { NextResponse } from 'next/server';
import { resolvePendingPhotoModeration } from '@/lib/safety/moderateAndUpload';
import { raiseCronFailureAlert, resolveCronFailureAlert } from '@/lib/ops/alerts';

// Same ceiling as the routes that used to run this inline (app/api/upload,
// app/api/profile/photos, app/api/profile's PUT) -- self-hosted
// nsfwjs+face-api on pure-JS tfjs is the slow part, not anything new
// here; this worker just runs it off the upload request instead of on it.
export const maxDuration = 60;

/**
 * Woken by QStash (lib/safety/moderationQueue.ts), once per PENDING photo
 * -- see that file's doc comment for why one message per photo is fine
 * at this app's volume. Auth is the same CRON_SECRET bearer check every
 * other cron/worker route in this codebase uses; QStash was told to send
 * that header at publish time (scheduleWake), so there's no separate
 * "this came from QStash" auth concept to maintain.
 *
 * Idempotent on purpose: QStash retries on a non-2xx response (retries: 3,
 * see qstash.ts), so a photo that's already been resolved by the time a
 * retry lands (or that a human admin resolved in the meantime) is a clean
 * no-op, not a double-charge or a double-notification.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured; refusing to run unauthenticated.' }, { status: 500 });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { photoId?: string };
  const photoId = body.photoId;
  if (!photoId) {
    return NextResponse.json({ error: 'photoId required' }, { status: 400 });
  }

  try {
    const result = await resolvePendingPhotoModeration(photoId);
    await resolveCronFailureAlert('moderate-photo');
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[moderate-photo] unhandled error', { photoId, err });
    await raiseCronFailureAlert('moderate-photo', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
