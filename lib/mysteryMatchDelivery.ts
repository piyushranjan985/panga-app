/**
 * Mystery Match's notification *delivery* -- draining the outbox
 * app/api/cron/mystery-match writes (MysteryMatchNotification rows),
 * never the pairing itself. See docs/MYSTERY_MATCH.md S11.
 *
 * Shared by two callers that need the exact same "send whatever's due,
 * right now, in one bounded pass" behavior:
 *  - app/api/cron/mystery-match-deliver -- the normal path, woken on a
 *    schedule by QStash (lib/queue/qstash.ts) every ~5 minutes across
 *    the 7:30-8:30pm IST reveal window.
 *  - app/api/cron/mystery-match itself, as a same-request fallback for
 *    when QStash isn't configured yet (queueConfigured === false) --
 *    see that route for why: the feature must still fully work at $0
 *    before QStash is wired up, just without the spread-over-an-hour
 *    behavior this file's two-phase design exists for.
 */
import { db } from '@/lib/db';
import { sendPushToUser } from '@/lib/notifications/push';
import { istTimeToday } from '@/lib/istTime';

const MAX_ATTEMPTS = 3;
// Bounded well under Vercel's 60s maxDuration even in a worst-case
// send-storm -- a drain pass that hits this cap simply leaves the rest
// PENDING for the next wake a few minutes later, rather than racing the
// function timeout.
const BATCH_LIMIT = 500;
// Concurrency within one pass, not a second queue -- large enough that a
// batch of 500 clears in a handful of chunks, small enough not to open
// hundreds of simultaneous DB/FCM calls at once.
const CHUNK_SIZE = 50;

export interface DeliverResult {
  claimed: number;
  sent: number;
  skippedNoConsent: number;
  failedPermanently: number;
  retriedLater: number;
}

/**
 * Sends every PENDING, due (scheduledFor <= now) notification, up to
 * BATCH_LIMIT, and marks each SENT/FAILED (or leaves it PENDING with
 * attempts+1 for a transient failure to retry on the next pass).
 * Idempotent to call repeatedly -- a row already SENT/FAILED is never
 * re-selected, and this never throws: a bad row is logged and counted,
 * never allowed to abort the rest of the batch.
 */
export async function deliverDueNotifications(now: Date = new Date()): Promise<DeliverResult> {
  const due = await db.mysteryMatchNotification.findMany({
    where: { status: 'PENDING', scheduledFor: { lte: now } },
    orderBy: { scheduledFor: 'asc' },
    take: BATCH_LIMIT,
  });

  const result: DeliverResult = { claimed: due.length, sent: 0, skippedNoConsent: 0, failedPermanently: 0, retriedLater: 0 };
  if (due.length === 0) return result;

  // One batched lookup for every profile this pass could possibly need
  // (as a notification recipient AND as the "matched with {{name}}" name
  // source) instead of up to 2 queries per row -- the same batching
  // instinct as the pairing cron's own profile fetch.
  const allIds = [...new Set(due.flatMap((n) => [n.userId, n.otherUserId]))];
  const profiles = await db.profile.findMany({
    where: { userId: { in: allIds } },
    select: { userId: true, displayName: true, notifyMatchesMessages: true },
  });
  const byUserId = new Map(profiles.map((p) => [p.userId, p]));

  for (let i = 0; i < due.length; i += CHUNK_SIZE) {
    const chunk = due.slice(i, i + CHUNK_SIZE);
    await Promise.all(
      chunk.map(async (row) => {
        const recipient = byUserId.get(row.userId);
        // Fails closed, same as lib/notifications/push.ts's
        // isPushCategoryEnabled: no profile, or the toggle is off ->
        // never retried, this pairing's push for this side is just done.
        if (!recipient || !recipient.notifyMatchesMessages) {
          await db.mysteryMatchNotification.update({
            where: { id: row.id },
            data: { status: 'FAILED', attempts: row.attempts + 1 },
          });
          result.skippedNoConsent++;
          return;
        }

        const otherName = byUserId.get(row.otherUserId)?.displayName ?? 'Someone';
        try {
          await sendPushToUser(row.userId, 'push.mystery_match', { name: otherName });
          await db.mysteryMatchNotification.update({
            where: { id: row.id },
            data: { status: 'SENT', sentAt: new Date(), attempts: row.attempts + 1 },
          });
          result.sent++;
        } catch (err) {
          const attempts = row.attempts + 1;
          if (attempts >= MAX_ATTEMPTS) {
            await db.mysteryMatchNotification.update({ where: { id: row.id }, data: { status: 'FAILED', attempts } });
            result.failedPermanently++;
          } else {
            // Stays PENDING at the same scheduledFor -- already due, so
            // the very next drain pass (normal ~5min cadence) retries it.
            await db.mysteryMatchNotification.update({ where: { id: row.id }, data: { attempts } });
            result.retriedLater++;
          }
          console.error('[push] mystery-match delivery failed', { notificationId: row.id, userId: row.userId, attempts, err });
        }
      }),
    );
  }

  return result;
}

/** Whether any row is still waiting to be sent (due or not) -- tells the deliver route whether to schedule another wake. */
export async function hasPendingNotifications(): Promise<boolean> {
  const next = await db.mysteryMatchNotification.findFirst({ where: { status: 'PENDING' }, select: { id: true } });
  return next !== null;
}

/**
 * Safety net for a broken QStash chain (a failed publish, an expired
 * token, Upstash itself being down): anything still PENDING past the
 * reveal window's hard cutoff is marked FAILED rather than left to pile
 * up silently or burst out hours late tomorrow. Returns how many rows
 * were swept, so the caller can log it loudly if non-zero.
 */
export async function sweepStaleNotifications(cutoff: Date): Promise<number> {
  const { count } = await db.mysteryMatchNotification.updateMany({
    where: { status: 'PENDING', scheduledFor: { lt: cutoff } },
    data: { status: 'FAILED' },
  });
  return count;
}

// The reveal window itself -- see docs/MYSTERY_MATCH.md S11 for why
// 7:30-8:30pm IST (not instant-at-8pm) and why there's a 15min grace
// cutoff past the window's own end before the delivery chain gives up
// and sweeps whatever's left rather than retrying forever.
export function revealWindowStart(now: Date): Date {
  return istTimeToday(now, 19, 30);
}

export function revealWindowEnd(now: Date): Date {
  return istTimeToday(now, 20, 30);
}

export function deliveryHardCutoff(now: Date): Date {
  return istTimeToday(now, 20, 45);
}

/** A uniformly random instant inside [windowStart, windowEnd] -- the per-notification jitter that turns "everyone at 8:00:00pm sharp" into a spread-out hour. */
export function jitterWithinWindow(windowStart: Date, windowEnd: Date): Date {
  const span = windowEnd.getTime() - windowStart.getTime();
  return new Date(windowStart.getTime() + Math.random() * span);
}
