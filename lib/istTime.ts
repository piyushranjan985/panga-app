/**
 * Shared IST ("Asia/Kolkata") day-boundary helper.
 *
 * India has no DST, so this fixed +5:30 offset never drifts -- unlike a
 * real IANA-timezone library call, it's safe to keep as a two-line
 * function with no dependency. Originally written inline inside
 * app/api/cron/mystery-match/route.ts (Mystery Match's 8:00pm IST daily
 * pairing, see docs/MYSTERY_MATCH.md); pulled out here once Wild Card's
 * daily-use quota (lib/wildCard.ts) needed the exact same "what day is it
 * in India right now" boundary and a second copy would've been silly.
 */
const IST_OFFSET_MS = 5.5 * 60 * 60_000;

/** Start of "today" in IST, as a real UTC Date (safe to compare against any stored DateTime). */
export function startOfTodayIST(now: Date): Date {
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const istMidnight = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()));
  return new Date(istMidnight.getTime() - IST_OFFSET_MS);
}
