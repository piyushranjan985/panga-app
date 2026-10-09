import { scheduleWake, queueConfigured } from '@/lib/queue/qstash';

/**
 * Hands a just-created, PENDING Photo row off to be analyzed OFF the
 * request/response cycle that stored it -- see docs/IDENTITY_VERIFICATION_AND_SAFETY.md
 * S11 for why this exists: the self-hosted nsfwjs+face-api analysis
 * (lib/safety/imageModeration.ts) is real CPU work with an unmeasured
 * per-call cost, and running it inline used to mean every upload request
 * (and, worse, onboarding's PUT, sequentially for up to 5 photos) paid
 * that cost before the user ever got a response -- slow at best, and a
 * Vercel duration/cost risk at real traffic.
 *
 * Reuses lib/queue/qstash.ts (already in this codebase for Mystery
 * Match's delivery worker) rather than a new queue: `notBefore: now`
 * means "run this as its own, separate function invocation as soon as
 * QStash can," which is the whole fix -- it's a different invocation
 * than the one handling the upload, so the upload response is never
 * blocked on it, and the worker's own duration/cost is free to vary
 * (slow photo, cold model, momentary contention) without the user
 * waiting on it.
 *
 * Deliberately one QStash message per photo, not a batch-sweep cron --
 * unlike push notifications (lib/queue/qstash.ts's own doc comment,
 * which explicitly avoided this for that reason), photo uploads happen
 * at onboarding (once) and the occasional profile-photo edit after
 * that, not per-swipe/per-message volume, so this stays comfortably
 * under QStash's free-tier message quota at real near-term scale. If
 * upload volume ever gets to where that stops being true, switch this
 * to the same self-rescheduling drain shape as
 * app/api/cron/mystery-match-deliver/route.ts instead of changing the
 * call sites.
 *
 * Returns `false` (never throws) when QStash isn't configured, or when
 * scheduling the wake call itself fails -- either way the caller's own
 * synchronous fallback (moderate inline, right there, same as today)
 * is what keeps every photo actually getting checked. This function
 * intentionally never leaves a photo un-moderated on its own: it either
 * hands off successfully or tells the caller to do it itself.
 */
export async function enqueuePhotoModeration(photoId: string): Promise<boolean> {
  if (!queueConfigured) return false;
  try {
    await scheduleWake('/api/cron/moderate-photo', { photoId }, new Date());
    return true;
  } catch (err) {
    console.error('[moderationQueue] failed to enqueue photo moderation, caller will fall back to inline', { photoId, err });
    return false;
  }
}
