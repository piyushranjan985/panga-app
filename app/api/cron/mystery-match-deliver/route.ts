import { NextResponse } from 'next/server';
import { scheduleWake } from '@/lib/queue/qstash';
import { deliverDueNotifications, hasPendingNotifications, sweepStaleNotifications, deliveryHardCutoff } from '@/lib/mysteryMatchDelivery';
import { raiseOpsAlert, resolveOpsAlert, raiseCronFailureAlert, resolveCronFailureAlert } from '@/lib/ops/alerts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Mystery Match's delivery worker -- see docs/MYSTERY_MATCH.md S11.
// Never scheduled by Vercel Cron: it's woken by QStash (lib/queue/qstash.ts),
// first by app/api/cron/mystery-match once pairing finishes, then by
// itself, roughly every 5 minutes, until either the outbox is empty or
// the reveal window's hard cutoff passes. Auth is the exact same
// CRON_SECRET bearer check every other cron route here uses -- QStash
// forwards whatever headers it was told to send at publish time, so
// there's no separate "this came from QStash" auth concept to maintain.
const REWAKE_DELAY_MS = 5 * 60_000;

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured; refusing to run unauthenticated.' }, { status: 500 });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { runId?: string };

  try {
    const now = new Date();
    const hardCutoff = deliveryHardCutoff(now);

    // Past the window's own 15-minute grace period: stop trying for
    // today. This is the safety net for a broken chain (an expired
    // QStash token, Upstash itself being down, this route throwing) --
    // anything still PENDING gets marked FAILED and raised as a CRITICAL
    // alert (dashboard + support@findmyvybe.com, see lib/ops/alerts.ts)
    // rather than piling up silently or bursting out hours late
    // tomorrow alongside a fresh day's run.
    if (now >= hardCutoff) {
      const sweptCount = await sweepStaleNotifications(hardCutoff);
      if (sweptCount > 0) {
        console.error('[mystery-match-deliver] reveal window closed with notifications still pending; swept as failed', {
          runId: body.runId,
          sweptCount,
        });
        await raiseOpsAlert({
          category: 'OUTAGE',
          severity: 'CRITICAL',
          title: 'Mystery Match reveal window closed with notifications still unsent',
          detail: `${sweptCount} notification(s) were still PENDING past the 8:30pm IST reveal window's 15-minute grace period and were swept to FAILED -- those users never got notified about today's pairing. This means the QStash delivery chain stopped running before the outbox was empty (a scheduling failure, a QStash outage, or repeated send failures). runId=${body.runId ?? 'unknown'}, cutoff=${hardCutoff.toISOString()}.`,
          sourceType: 'system',
          sourceId: 'cron:mystery-match-deliver',
          // Not a lifecycle incident (fingerprint omitted on purpose) -- by
          // the time this fires, today's window has already fully closed,
          // so there's nothing ongoing to track or later resolve. Each
          // day's sweep is its own discrete, already-over event; the
          // natural once-a-day ceiling makes flooding impossible without
          // the fingerprint machinery.
        });
      }
      return NextResponse.json({ ok: true, done: true, swept: sweptCount });
    }

    const result = await deliverDueNotifications(now);

    const stillPending = await hasPendingNotifications();
    let rescheduled = false;
    if (stillPending) {
      try {
        await scheduleWake('/api/cron/mystery-match-deliver', { runId: body.runId ?? '' }, new Date(now.getTime() + REWAKE_DELAY_MS));
        rescheduled = true;
      } catch (err) {
        // Logged + alerted -- the chain stops here if this keeps
        // failing, and whatever's left PENDING will be caught by the
        // hard-cutoff sweep above once enough time has passed, rather
        // than retried forever.
        console.error('[mystery-match-deliver] failed to schedule the next delivery wake', { runId: body.runId, err });
        await raiseOpsAlert({
          category: 'OUTAGE',
          severity: 'WARNING',
          title: 'Mystery Match delivery could not schedule its next QStash wake',
          detail: `scheduleWake failed with ${result.claimed > 0 ? `${result.sent} sent / ${result.claimed} claimed this pass` : 'nothing due this pass'}; notifications may still be PENDING. If this keeps happening until 8:45pm IST, the hard-cutoff sweep will raise a CRITICAL alert instead. runId=${body.runId ?? 'unknown'}. Error: ${err instanceof Error ? err.message : String(err)}`,
          sourceType: 'system',
          sourceId: 'cron:mystery-match-deliver',
          fingerprint: 'cron:mystery-match-deliver:qstash-rewake',
        });
      }
    }

    // A clean pass (rescheduled fine, or nothing left to do) means this
    // worker itself is healthy -- close out a prior "couldn't schedule
    // the next wake" incident if one was open. Cheap: only writes
    // anything when a matching OPEN row actually exists (see
    // resolveOpsAlert's own comment).
    if (rescheduled || !stillPending) {
      await resolveOpsAlert({ fingerprint: 'cron:mystery-match-deliver:qstash-rewake', resolutionDetail: 'QStash wake scheduling succeeded again.' });
    }
    await resolveCronFailureAlert('mystery-match-deliver');

    return NextResponse.json({ ok: true, done: !stillPending, rescheduled, ...result });
  } catch (err) {
    console.error('[mystery-match-deliver] unhandled error', err);
    await raiseCronFailureAlert('mystery-match-deliver', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
