import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { rulesBasedProvider } from '@/lib/matchIntelligence';
import { raiseCronFailureAlert, resolveCronFailureAlert } from '@/lib/ops/alerts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Bounded batch, not a full-table scan -- same "cap it, don't scan
// everyone" stance as app/api/cron/mystery-match/route.ts's
// MYSTERY_POOL_LIMIT_PER_CATEGORY. 2,000 users is comfortably inside this
// function's 60s maxDuration (rulesBasedProvider's queries are batched,
// not one-per-user) while still making steady progress across the whole
// active user base run over run -- raise this once a real production run
// shows it finishing with room to spare.
const INTELLIGENCE_SIGNAL_BATCH_LIMIT = 2000;

// Only users active in the last 30 days are worth recomputing at all --
// mirrors lib/matchIntelligence.ts's own 30-day recent-match window, and
// keeps this job from spending its batch budget on long-dormant accounts
// whose score will never be read by lib/discoverPool.ts anyway (a dormant
// profile is excluded from the eligible pool entirely well before
// intelligenceScore ever matters).
const ACTIVE_WITHIN_DAYS = 30;

/**
 * Recomputes Profile.intelligenceScore for a bounded batch of recently-
 * active users. Same CRON_SECRET bearer-auth pattern as
 * app/api/cron/otp-cleanup/route.ts and app/api/cron/mystery-match/route.ts;
 * see vercel.json for the schedule. Writing this field is harmless even
 * while lib/discoverPool.ts's matching_intelligence_signal FeatureFlag is
 * off (the default) -- discoverPool.ts simply never reads the column into
 * a candidate's MatchableProfile until that flag is turned on.
 */
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
    const since = new Date(Date.now() - ACTIVE_WITHIN_DAYS * 24 * 60 * 60 * 1000);
    const users = await db.user.findMany({
      where: {
        lastActiveAt: { gte: since },
        status: 'ACTIVE',
        profile: { isNot: null },
      },
      orderBy: { lastActiveAt: 'desc' },
      take: INTELLIGENCE_SIGNAL_BATCH_LIMIT,
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);

    const scores = await rulesBasedProvider.computeBatch(userIds);
    const now = new Date();

    await Promise.all(
      [...scores.entries()].map(([userId, intelligenceScore]) =>
        db.profile.update({
          where: { userId },
          data: { intelligenceScore, intelligenceScoreUpdatedAt: now },
        }),
      ),
    );

    await resolveCronFailureAlert('intelligence-signal');
    return NextResponse.json({ ok: true, batchSize: userIds.length, updated: scores.size });
  } catch (err) {
    console.error('[cron] intelligence-signal failed', err);
    await raiseCronFailureAlert('intelligence-signal', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
