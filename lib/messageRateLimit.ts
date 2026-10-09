/**
 * Message-send volume cap -- a cost/abuse safety valve, same shape and
 * same reasoning as lib/swipeRateLimit.ts (read that file's comment
 * first). Deliberately framework/DB-free: a plain, synchronous decision
 * given a plain number, with app/api/matches/[matchId]/messages/route.ts
 * owning the actual COUNT query (backed by the
 * (senderId, createdAt) index -- see the migration that added it).
 *
 * Unlike Swipe, nothing here existed before this review: message sending
 * had no rate limit of any kind, only `checkMessagingAllowed` (an
 * account-level blocked/suspended check) and ordinary participant
 * authorization. The blast radius of unlimited sending is small (a
 * match's channel has exactly two participants -- there's no fan-out to
 * abuse), so this is a lower-urgency valve than Swipe's, not a response
 * to an observed problem. What it bounds: a scripted spam loop into one
 * conversation running up Ably publish counts, push-notification sends,
 * and Message rows with nothing to stop it. The default (120/hour, i.e.
 * one every 30 seconds sustained) is well above anything a real
 * conversation produces -- texting fast in a real exchange is nowhere
 * near this -- so a genuine user should never see it.
 */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getMessageHourlyLimit(): number {
  return envInt('MESSAGE_HOURLY_LIMIT', 120);
}

/** Pure comparison, same shape as evaluateSwipeCount/evaluateOtpRequestCounts. */
export function evaluateMessageCount(limit: number, countLastHour: number): { ok: true } | { ok: false } {
  if (countLastHour >= limit) return { ok: false };
  return { ok: true };
}
