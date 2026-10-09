import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { deleteImage } from '@/lib/upload';
import {
  moderateImageUrl,
  recordPhotoModeration,
  photoRejectionMessage,
  manualReviewMessage,
  photoApprovedMessage,
} from '@/lib/safety/moderateAndUpload';
import { isPushCategoryEnabled, sendPushToUser } from '@/lib/notifications/push';
import { isBrevoConfigured, sendTransactionalEmail } from '@/lib/notifications/email';
import { raiseOpsAlert, resolveOpsAlert, raiseCronFailureAlert, resolveCronFailureAlert, shouldAlertNow } from '@/lib/ops/alerts';

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
    const photo = await db.photo.findUnique({
      where: { id: photoId },
      include: { profile: { select: { userId: true, displayName: true, user: { select: { email: true, emailVerified: true } } } } },
    });

    // Gone, or already resolved (a QStash retry landing after a prior
    // attempt already succeeded, or an admin got to it first via the
    // moderation console) -- nothing to do, and importantly nothing to
    // re-notify about.
    if (!photo || photo.moderationStatus !== 'PENDING') {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const { userId, displayName } = photo.profile;
    const outcome = await moderateImageUrl(photo.url);

    await recordPhotoModeration({ photoId: photo.id, subjectUserId: userId, outcome });

    if (outcome.decision === 'REJECTED') {
      // See moderateAndUpload.ts's recordPhotoModeration -- the DB row is
      // already soft-removed (removedAt/removedReason); this is the other
      // half, scrubbing the actual blob now that a human will never need
      // to look at it (unlike an admin-removed photo, there's no review
      // workflow that benefits from the file still existing).
      await deleteImage(photo.url);
    }

    // Best-effort notification, both channels -- neither throws (push
    // never throws by design; email failures are caught right here),
    // and a failure in either must never fail this worker or leave the
    // photo's own moderation result unrecorded -- that part already
    // happened above.
    const message =
      outcome.decision === 'REJECTED'
        ? photoRejectionMessage(outcome)
        : outcome.decision === 'MANUAL_REVIEW'
          ? manualReviewMessage(outcome)
          : photoApprovedMessage();

    try {
      if (await isPushCategoryEnabled(userId, 'reminders')) {
        await sendPushToUser(userId, 'push.photo_moderation', { outcome: message });
      }
    } catch (err) {
      console.error('[moderate-photo] push notification failed', { photoId, err });
    }

    const email = photo.profile.user.email;
    if (email && photo.profile.user.emailVerified && isBrevoConfigured()) {
      try {
        await sendTransactionalEmail({
          to: email,
          subject:
            outcome.decision === 'REJECTED'
              ? "We couldn't approve your findmyVybe photo"
              : outcome.decision === 'MANUAL_REVIEW'
                ? 'Your findmyVybe photo is being reviewed'
                : 'Your findmyVybe photo was approved',
          text: `Hi ${displayName},\n\n${message}\n\n-- The findmyVybe team`,
          html: `<p>Hi ${displayName},</p><p>${message}</p><p style="color:#666;font-size:0.9em">-- The findmyVybe team</p>`,
        });
        await resolveOpsAlert({ fingerprint: 'integration:photo-moderation-email', resolutionDetail: 'Photo moderation confirmation email succeeded again.' });
      } catch (err) {
        console.error('[moderate-photo] confirmation email failed', { photoId, err });
        if (shouldAlertNow('photo-moderation-email')) {
          await raiseOpsAlert({
            category: 'SYSTEM',
            severity: 'WARNING',
            title: 'Photo moderation result emails failing',
            detail: `sendTransactionalEmail failed while notifying a user of their photo moderation outcome. Error: ${err instanceof Error ? err.message : String(err)}`,
            sourceType: 'system',
            sourceId: 'integration:photo-moderation-email',
            fingerprint: 'integration:photo-moderation-email',
          });
        }
      }
    }

    await resolveCronFailureAlert('moderate-photo');
    return NextResponse.json({ ok: true, decision: outcome.decision });
  } catch (err) {
    console.error('[moderate-photo] unhandled error', { photoId, err });
    await raiseCronFailureAlert('moderate-photo', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
