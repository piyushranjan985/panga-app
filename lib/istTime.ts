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

/**
 * A specific wall-clock time on "today" in IST, as a real UTC Date --
 * e.g. istTimeToday(now, 19, 30) for 7:30pm IST today. Built from
 * startOfTodayIST so it shares the exact same "today" boundary; only
 * valid for a `now` that's actually on the IST calendar day you mean
 * (both Mystery Match crons that use this -- the pairing cron and its
 * delivery worker -- run well inside one IST day of each other, so this
 * never needs to reason about crossing midnight).
 */
export function istTimeToday(now: Date, hour: number, minute: number): Date {
  return new Date(startOfTodayIST(now).getTime() + (hour * 60 + minute) * 60_000);
}
