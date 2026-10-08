import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isPushCategoryEnabled, sendPushToUser } from '@/lib/notifications/push';
import { raiseCronFailureAlert, resolveCronFailureAlert } from '@/lib/ops/alerts';

export const dynamic = 'force-dynamic';

// ~2 days after the most recent PLAN-kind message in a match -- the
// closest proxy this schema has for "they had a planned meetup" (see
// docs/PUSH_NOTIFICATIONS.md §4's design note: there's no literal stored
// meetup-date field anywhere -- lib/vybeContent.ts's getPlanFlow only
// ever produces a PLAN message, never a date/time -- so this is
// deliberately a heuristic, not a precise "did they actually meet"
// signal).
//
// A single 24-hour-wide window (47h-71h after the PLAN message) rather
// than "more than 47h ago": this cron runs once a day, so a window
// exactly as wide as the run interval means each eligible PLAN message
// passes through it on exactly one day's run, with no separate
// "already nudged" tracking column needed. Re-running this job twice in
// one day (e.g. a manual retry) could double-nudge -- acceptable for an
// MVP reminder, not worth a dedup table for.
const WINDOW_START_HOURS = 47;
const WINDOW_END_HOURS = 71;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured; refusing to run unauthenticated.' }, { status: 500 });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const windowStart = new Date(Date.now() - WINDOW_END_HOURS * 3600_000);
    const windowEnd = new Date(Date.now() - WINDOW_START_HOURS * 3600_000);

    const planMessages = await db.message.findMany({
      where: { kind: 'PLAN', createdAt: { gte: windowStart, lt: windowEnd }, match: { unmatchedAt: null } },
      select: { matchId: true, createdAt: true, match: { select: { userAId: true, userBId: true } } },
      orderBy: { createdAt: 'desc' },
    });

    // Dedup to the latest PLAN message per match -- a match could in
    // principle have more than one PLAN message land in the same window.
    const byMatch = new Map<string, { userAId: string; userBId: string }>();
    for (const m of planMessages) {
      if (!byMatch.has(m.matchId)) byMatch.set(m.matchId, m.match);
    }
    if (byMatch.size === 0) {
      await resolveCronFailureAlert('date-feedback-nudge');
      return NextResponse.json({ ok: true, matchesScanned: 0, nudged: 0 });
    }

    const matchIds = [...byMatch.keys()];
    const allUserIds = [...new Set([...byMatch.values()].flatMap((m) => [m.userAId, m.userBId]))];

    const [existingFeedback, profiles] = await Promise.all([
      db.dateFeedback.findMany({ where: { matchId: { in: matchIds } }, select: { matchId: true, userId: true } }),
      db.profile.findMany({ where: { userId: { in: allUserIds } }, select: { userId: true, displayName: true } }),
    ]);
    const alreadySubmitted = new Set(existingFeedback.map((f) => `${f.matchId}:${f.userId}`));
    const nameByUser = new Map(profiles.map((p) => [p.userId, p.displayName]));

    let nudged = 0;
    for (const [matchId, { userAId, userBId }] of byMatch) {
      for (const [userId, otherId] of [
        [userAId, userBId],
        [userBId, userAId],
      ] as const) {
        if (alreadySubmitted.has(`${matchId}:${userId}`)) continue;
        try {
          if (await isPushCategoryEnabled(userId, 'reminders')) {
            await sendPushToUser(userId, 'push.date_feedback_nudge', { name: nameByUser.get(otherId) ?? 'your match' });
            nudged++;
          }
        } catch (err) {
          // Per-user, deliberately NOT escalated to an ops alert -- one
          // person's stale device token failing is routine (see
          // lib/notifications/push.ts), not an operational incident.
          // The systemic version of this (FCM itself unreachable) is
          // already caught once, loudly, inside sendPushToUser/
          // getAccessToken rather than here per match -- see
          // docs/OPS_ALERTS.md.
          console.error('[push] date-feedback-nudge trigger failed', { matchId, userId, err });
        }
      }
    }

    await resolveCronFailureAlert('date-feedback-nudge');
    return NextResponse.json({ ok: true, matchesScanned: byMatch.size, nudged });
  } catch (err) {
    console.error('[cron] date-feedback-nudge failed', err);
    await raiseCronFailureAlert('date-feedback-nudge', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
