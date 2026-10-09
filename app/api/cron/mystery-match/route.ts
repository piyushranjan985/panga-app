import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { matchMysteryPool, nextRotationCategory, type MysteryCandidate, type MysteryCategory } from '@/lib/mysteryMatch';
import { startOfTodayIST } from '@/lib/istTime';
import { queueConfigured, scheduleWake } from '@/lib/queue/qstash';
import { deliverDueNotifications, revealWindowStart, revealWindowEnd, jitterWithinWindow } from '@/lib/mysteryMatchDelivery';
import { raiseOpsAlert, resolveOpsAlert, raiseCronFailureAlert, resolveCronFailureAlert } from '@/lib/ops/alerts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Mystery Match's pairing step runs on India time regardless of where
// Vercel's cron clock or this function's region happens to be -- see
// docs/MYSTERY_MATCH.md. vercel.json's schedule ("45 13 * * *") is
// 7:15pm IST expressed in UTC: moved earlier than the 8:00pm reveal
// itself (it used to run AT 8:00pm and notify everyone inline, in the
// same request -- see S11 for why that stopped scaling) so there's a
// comfortable margin to finish pairing and queue the outbox before the
// 7:30pm reveal window even opens.
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60_000;

function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

const CATEGORIES: MysteryCategory[] = ['MYSTERY_MATCH', 'VYBE_FLIP', 'NO_LABELS'];

// See the pool-capping comment inside the pairing loop below for why
// this exists and how it was chosen.
const MYSTERY_POOL_LIMIT_PER_CATEGORY = 1500;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured; refusing to run unauthenticated.' }, { status: 500 });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const todayStartIST = startOfTodayIST(now);
  const runId = todayStartIST.toISOString().slice(0, 10); // IST calendar date, e.g. "2026-10-08"

  // Everything below is wrapped in one try/catch -- an uncaught throw
  // anywhere in pairing (a bad DB connection, a schema drift) used to
  // just 500 with nothing but a Vercel log line nobody's watching. Now
  // it also lands as a CRITICAL alert on the admin dashboard + emails
  // support@findmyvybe.com (see lib/ops/alerts.ts) -- a whole missed
  // day of Mystery Match is exactly the kind of "nobody would otherwise
  // notice" failure that function exists for.
  try {
    // --- Step 1: auto-rotate selections nobody has touched in 7 days -----
    // Unchanged from before -- see docs/MYSTERY_MATCH.md's consent note on
    // why opting out is sticky (OPTED_OUT is never touched in either
    // direction here).
    const stale = await db.profile.findMany({
      where: {
        mysteryCategory: { not: 'OPTED_OUT' },
        mysteryCategorySetAt: { lte: new Date(now.getTime() - SEVEN_DAYS_MS) },
      },
      select: { userId: true, mysteryCategory: true },
    });
    await Promise.all(
      stale.map((p) =>
        db.profile.update({
          where: { userId: p.userId },
          data: { mysteryCategory: nextRotationCategory(p.mysteryCategory as MysteryCategory), mysteryCategorySetAt: now },
        }),
      ),
    );

    // --- Step 2: build each category's pool and run the pairing ----------
    // Loaded BEFORE the exclusion queries below (reordered from how this
    // used to read) -- the exclusion queries need today's eligible pool
    // first, to scope themselves to it. Filters unchanged -- same
    // account-health filters app/api/discover/route.ts's candidate pool
    // uses.
    const profiles = await db.profile.findMany({
      where: {
        quietMode: false,
        mysteryCategory: { not: 'OPTED_OUT' },
        user: { status: 'ACTIVE', discoveryRestricted: false, profileHidden: false },
      },
      select: {
        userId: true,
        gender: true,
        lookingFor: true,
        city: true,
        intent: true,
        mysteryCategory: true,
        interests: { select: { id: true } },
        tribes: { select: { id: true } },
        user: { select: { lastActiveAt: true } },
      },
    });

    const toCandidate = (p: (typeof profiles)[number]): MysteryCandidate => ({
      userId: p.userId,
      gender: p.gender as MysteryCandidate['gender'],
      lookingFor: p.lookingFor as MysteryCandidate['gender'][],
      city: p.city,
      intent: p.intent as MysteryCandidate['intent'],
      interestIds: p.interests.map((i) => i.id),
      tribeIds: p.tribes.map((t) => t.id),
      lastActiveAt: p.user.lastActiveAt,
    });

    // Grouped by city up front -- isEligiblePair() in lib/mysteryMatch.ts
    // has always required a.city === b.city, but until this change the
    // pairing loop scored EVERY cross-city combination too, just to throw
    // the result away. Pairing per city, over that city's own slice of
    // `profiles`, means the O(n^2) scoring pass (see matchMysteryPool)
    // only ever runs over candidates who could actually be paired, not
    // the whole platform.
    const profilesByCity = new Map<string, typeof profiles>();
    for (const p of profiles) {
      const list = profilesByCity.get(p.city);
      if (list) list.push(p);
      else profilesByCity.set(p.city, [p]);
    }

    // --- Step 3: exclusions that apply everywhere, regardless of category --
    // Prior Mystery Match history (any category, ever), existing/past
    // Match, Swipe in either direction, Block in either direction. Same
    // "never show this pair to each other again" promise as
    // app/api/discover/route.ts's exclusion set.
    //
    // SCOPED to today's eligible pool (poolUserIds), not loaded unbounded
    // platform-wide -- these four queries used to be `findMany()` with no
    // `where` at all, meaning every Swipe/Match/Block/MysteryMatchHistory
    // row this app has EVER written was loaded, in full, into one
    // function's memory, every single day. Fine at a few hundred rows;
    // guaranteed to blow this function's 60s maxDuration (and likely its
    // memory) once Swipe alone -- by far the highest-volume of the four,
    // up to SWIPE_DAILY_LIMIT rows per user per day -- reaches real
    // six-figure-user volume, even with the 180-day purge in
    // docs/DATA_RETENTION.md keeping it from growing forever.
    //
    // The scoping is lossless: a pair can only ever be chosen today if
    // BOTH sides are in today's eligible pool (every pairing candidate
    // comes from `profiles` above), so a Swipe/Match/Block/History row
    // where either side ISN'T in that pool can never matter to today's
    // run -- excluding it from the query loses nothing. If this pool
    // itself ever grows into the tens of thousands, a plain `IN (...)`
    // list is the next thing to revisit (move to a joined temp table),
    // but it's already a dramatic improvement over an unbounded
    // full-table scan.
    const poolUserIds = profiles.map((p) => p.userId);
    const poolIdFilter = { in: poolUserIds };
    const [history, matches, swipes, blocks] = await Promise.all([
      db.mysteryMatchHistory.findMany({
        where: { userAId: poolIdFilter, userBId: poolIdFilter },
        select: { userAId: true, userBId: true },
      }),
      db.match.findMany({
        where: { userAId: poolIdFilter, userBId: poolIdFilter },
        select: { userAId: true, userBId: true },
      }),
      db.swipe.findMany({
        where: { fromUserId: poolIdFilter, toUserId: poolIdFilter },
        select: { fromUserId: true, toUserId: true },
      }),
      db.block.findMany({
        where: { blockerId: poolIdFilter, blockedId: poolIdFilter },
        select: { blockerId: true, blockedId: true },
      }),
    ]);
    const excludePairs = new Set<string>();
    const addPair = (a: string, b: string) => {
      const [x, y] = orderedPair(a, b);
      excludePairs.add(`${x}:${y}`);
    };
    for (const h of history) addPair(h.userAId, h.userBId);
    for (const m of matches) addPair(m.userAId, m.userBId);
    for (const s of swipes) addPair(s.fromUserId, s.toUserId);
    for (const b of blocks) addPair(b.blockerId, b.blockedId);

    let totalPairs = 0;

    // --- Step 4: write the real Match + history rows, and queue (never
    // send) each side's notification -------------------------------------
    // This used to also call sendPushToUser inline, per pair, awaited one
    // at a time -- fine for a handful of pairs, but it's exactly the
    // thundering-herd + fan-out-inside-one-request pattern that doesn't
    // scale (see docs/MYSTERY_MATCH.md S11): a single request both
    // computing AND pushing to everyone risks this function's 60s
    // maxDuration as the pool grows, and sends every push at the literal
    // same instant instead of across the 7:30-8:30pm window PKR asked for.
    //
    // So this step now ONLY writes rows -- Match, MysteryMatchHistory, and
    // one MysteryMatchNotification outbox row per side, each jittered to a
    // random instant inside the reveal window. Actually sending is
    // app/api/cron/mystery-match-deliver's job, woken on a schedule by
    // QStash (or, if QStash isn't configured yet, run once inline right
    // here at the end of this function -- see the fallback below).
    const windowStart = revealWindowStart(now);
    const windowEnd = revealWindowEnd(now);

    const notificationRows: {
      runId: string;
      matchId: string;
      userId: string;
      otherUserId: string;
      category: MysteryCategory;
      scheduledFor: Date;
    }[] = [];

    // One pairing pass per city, per category -- see the profilesByCity
    // comment above for why. A city with very few (or zero) opted-in
    // users today just produces a small or empty pool, same as before;
    // this only changes how much gets scored per O(n^2) pass, and how
    // tightly the exclusion-set query above can be scoped.
    for (const [city, cityProfiles] of profilesByCity) {
      for (const category of CATEGORIES) {
        let pool = cityProfiles.filter((p) => p.mysteryCategory === category).map(toCandidate);
        if (pool.length < 2) continue;

        // Safety valve, not a tuning knob: matchMysteryPool's pairing pass
        // is O(n^2) in pool size (see lib/mysteryMatch.ts's file comment
        // -- a once-a-day batch job, not a per-request hot path, so a
        // greedy O(n^2) solve was a deliberate "good enough" choice, just
        // never bounded). 1,500^2 is ~2.25M scored pairs, which runs in
        // well under a second in plain JS -- comfortably inside this
        // function's 60s budget even if every city/category pool hit the
        // cap in the same run. A single pool crossing this means some of
        // today's eligible users in that city/category don't get
        // considered against each other today, not that pairing stops --
        // a random sample keeps it fair rather than always dropping the
        // same tail of users (e.g. always the least-recently-active).
        // Revisit this (bucket by gender/intent first, or a real matching
        // algorithm) only once a real city is actually hitting it -- the
        // log line below is how you'd know.
        if (pool.length > MYSTERY_POOL_LIMIT_PER_CATEGORY) {
          console.warn(
            `[mystery-match] ${city}/${category} pool of ${pool.length} exceeds the ${MYSTERY_POOL_LIMIT_PER_CATEGORY} cap -- sampling down. Time to revisit matchMysteryPool's O(n^2) pass if this keeps happening.`,
          );
          for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j]!, pool[i]!];
          }
          pool = pool.slice(0, MYSTERY_POOL_LIMIT_PER_CATEGORY);
        }

        const pairs = matchMysteryPool(category, pool, excludePairs, now);
        totalPairs += pairs.length;

        for (const { userIdA, userIdB } of pairs) {
          const [userAId, userBId] = orderedPair(userIdA, userIdB);

          // Keep every future day's pool honest about this pair
          // immediately -- recorded even if a later push attempt fails,
          // so a notification hiccup can never cause the same two people
          // to be re-paired tomorrow.
          const match = await db.match.upsert({
            where: { userAId_userBId: { userAId, userBId } },
            update: {},
            create: { userAId, userBId, isMysteryMatch: true, mysteryCategory: category },
          });
          await db.mysteryMatchHistory.upsert({
            where: { userAId_userBId: { userAId, userBId } },
            update: {},
            create: { userAId, userBId, category, matchId: match.id },
          });

          notificationRows.push(
            { runId, matchId: match.id, userId: userAId, otherUserId: userBId, category, scheduledFor: jitterWithinWindow(windowStart, windowEnd) },
            { runId, matchId: match.id, userId: userBId, otherUserId: userAId, category, scheduledFor: jitterWithinWindow(windowStart, windowEnd) },
          );
        }
      }
    }

    if (notificationRows.length > 0) {
      await db.mysteryMatchNotification.createMany({ data: notificationRows });
    }

    // --- Step 5: kick off delivery ----------------------------------------
    let deliveryMode: 'queued' | 'inline-fallback' | 'none-needed' = 'none-needed';
    if (notificationRows.length > 0) {
      if (queueConfigured) {
        try {
          const firstWake = windowStart.getTime() > now.getTime() ? windowStart : now;
          await scheduleWake('/api/cron/mystery-match-deliver', { runId }, firstWake);
          deliveryMode = 'queued';
          // Scheduling worked -- close out a prior "couldn't schedule"
          // incident if one was open (cheap no-op otherwise).
          await resolveOpsAlert({ fingerprint: 'cron:mystery-match:qstash-schedule', resolutionDetail: 'QStash scheduling succeeded again.' });
        } catch (err) {
          // The matches themselves are already safely written -- only
          // delivery is at risk. Fall back to sending right now (today's
          // pushes land in one burst instead of spread across the hour,
          // but nobody silently never gets notified), log loudly, AND
          // raise a dashboard+email alert -- this is exactly the kind of
          // integration failure that used to be invisible (see
          // docs/OPS_ALERTS.md).
          console.error('[mystery-match] QStash scheduling failed; falling back to inline delivery', err);
          await raiseOpsAlert({
            category: 'OUTAGE',
            severity: 'WARNING',
            title: 'Mystery Match could not schedule its QStash delivery chain',
            detail: `Pairing succeeded (${notificationRows.length} notifications queued) but scheduling the first QStash wake failed, so delivery fell back to sending everything immediately instead of spread across 7:30-8:30pm IST. Nobody missed a notification, they just all landed in one burst today. runId=${runId}. Error: ${err instanceof Error ? err.message : String(err)}`,
            sourceType: 'system',
            sourceId: 'cron:mystery-match',
            fingerprint: 'cron:mystery-match:qstash-schedule',
          });
          await deliverDueNotifications(new Date(windowEnd.getTime() + 1));
          deliveryMode = 'inline-fallback';
        }
      } else {
        // QSTASH_TOKEN isn't set yet -- same "ships before the
        // integration is configured" stance as lib/cache.ts. Send
        // everything right now instead of waiting for a window that
        // nothing will ever come along to drain. Pass a `now` past the
        // window's end so every just-created row counts as "due". Not
        // alert-worthy -- this is expected/default state, not a failure.
        await deliverDueNotifications(new Date(windowEnd.getTime() + 1));
        deliveryMode = 'inline-fallback';
      }
    }

    // A full run without throwing -- close out a prior crash incident
    // if one was open.
    await resolveCronFailureAlert('mystery-match');

    return NextResponse.json({
      ok: true,
      rotated: stale.length,
      poolSize: profiles.length,
      totalPairs,
      notificationsQueued: notificationRows.length,
      deliveryMode,
      runId,
      todayStartIST,
    });
  } catch (err) {
    console.error('[mystery-match] unhandled error', err);
    await raiseCronFailureAlert('mystery-match', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
