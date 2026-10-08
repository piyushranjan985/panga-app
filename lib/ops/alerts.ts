/**
 * The one place in this codebase that turns "something broke that
 * nobody would otherwise notice" into (a) a tracked incident row on the
 * admin Notifications page and (b) an email -- see docs/OPS_ALERTS.md
 * for the full convention, the incident lifecycle this implements, and
 * the list of what already calls this.
 *
 * This is an INCIDENT tracker, not a log: calling raiseOpsAlert() twice
 * for the same `fingerprint` while the first occurrence is still open
 * updates that ONE row (bumping occurrenceCount/lastSeenAt) instead of
 * inserting a second row -- that's what keeps a flapping integration
 * from flooding the admin table or the inbox. Severity decides whether
 * it's dashboard-only (INFO) or also emailed (WARNING/CRITICAL); while
 * an incident stays open, the email itself only repeats once every
 * OPS_ALERT_RENOTIFY_MINUTES (default 2h) -- "still broken" nudges, not
 * one email per failed request. resolveOpsAlert() is the other half:
 * call it from the corresponding SUCCESS path so a cleared incident
 * both updates its own row (resolvedAt) and sends exactly one
 * "resolved" email, rather than leaving a stale-looking open alert
 * sitting on the dashboard forever.
 *
 * Reuses the exact table/UI a human's own "Log as alert" click already
 * writes to (admin/app/api/notifications/alerts/route.ts, rendered by
 * admin/app/(console)/notifications/page.tsx) -- every new column this
 * adds (fingerprint, occurrenceCount, lastSeenAt, lastNotifiedAt,
 * resolvedAt) is null/default on a human-logged row and simply unused
 * by that flow, which is untouched.
 *
 * Email reuses the existing Brevo wrapper (lib/notifications/email.ts),
 * same "ships before configured, upgrades the moment it is" stance: if
 * Brevo isn't set up, the dashboard row still gets written correctly,
 * the email step just no-ops.
 */
import { db } from '@/lib/db';
import { isBrevoConfigured, sendTransactionalEmail } from '@/lib/notifications/email';

export type OpsAlertCategory = 'SECURITY' | 'MODERATION' | 'SLA_BREACH' | 'SYSTEM' | 'PAYMENT' | 'VERIFICATION' | 'PRIVACY' | 'OUTAGE';
export type OpsAlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

const ALERT_EMAIL = process.env.OPS_ALERT_EMAIL || 'support@findmyvybe.com';
// How often an EMAIL repeats for an incident that's still open --
// separate from occurrenceCount/lastSeenAt, which update every call
// regardless. "Once per 2 hours or something like that," per the
// explicit ask -- configurable since what's right for a dating app's
// MVP traffic may not be right once it's running at real scale.
const RENOTIFY_INTERVAL_MS = Math.max(1, Number(process.env.OPS_ALERT_RENOTIFY_MINUTES) || 120) * 60_000;
// OpsAlert.detail has no DB-level cap, but the admin API's own zod
// schema caps it at 2000 for a human-logged alert -- staying under
// that keeps a system-raised row consistent with one.
const DETAIL_MAX_CHARS = 1800;

export interface RaiseOpsAlertInput {
  category: OpsAlertCategory;
  /** Defaults to WARNING. INFO is tracked on the dashboard only, never emailed. */
  severity?: OpsAlertSeverity;
  /** A STABLE description of the failure type, e.g. "FCM access token fetch failed" -- shown as the row's title on every re-occurrence, so keep ids/timestamps out of it (that's what `detail` and the dashboard's own occurrence count/timestamps are for). */
  title: string;
  /** The specifics for THIS occurrence -- error message, counts, ids. Replaces the open row's previous detail (so the dashboard always shows the latest failure, not the first). Truncated to DETAIL_MAX_CHARS. */
  detail?: string;
  /** 'system' for anything without a specific admin-visible record behind it (every call site as of 2026-10-08). */
  sourceType: string;
  sourceId?: string;
  /**
   * The incident's identity -- e.g. "integration:fcm-push",
   * "cron:mystery-match". Everything with the SAME fingerprint and no
   * `resolvedAt` yet is treated as the same ongoing incident; a
   * different fingerprint always starts a new one. Pick one per
   * distinct failure mode, not per error message (two different FCM
   * errors are still the same "FCM is down" incident).
   *
   * Omit it ONLY for a genuinely discrete, already-over-by-the-time-
   * we-know event with no ongoing state to track or later resolve (see
   * docs/OPS_ALERTS.md's stateful-vs-event distinction) -- every call
   * site as of 2026-10-08 that omits this is naturally capped at once a
   * day by its own cron schedule, so there's no flood risk even without
   * the dedupe. Omitting it on a per-request hot-path call site WOULD
   * flood the table; don't.
   */
  fingerprint?: string;
}

export interface ResolveOpsAlertInput {
  fingerprint: string;
  /** What to append to the incident's detail on close, e.g. "FCM access token fetch succeeded again." Optional -- a generic resolution note is fine too. */
  resolutionDetail?: string;
}

function errorDetail(err: unknown): string {
  if (err instanceof Error) return err.stack ?? err.message;
  return String(err);
}

function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`;
}

async function sendAlertEmail(subjectPrefix: string, title: string, lines: string[]): Promise<void> {
  if (!isBrevoConfigured()) return;
  try {
    const text = `${title}\n\n${lines.join('\n')}\n\nOpen in admin: Notifications & Operations > Open alerts.`;
    const html = `<p><strong>${title}</strong></p><p>${lines.join('<br>')}</p><p>Open in admin: Notifications &amp; Operations &gt; Open alerts.</p>`;
    await sendTransactionalEmail({ to: ALERT_EMAIL, subject: `${subjectPrefix} ${title}`, text, html });
  } catch (err) {
    console.error('[ops-alert] failed to send alert email', { title, err });
  }
}

/**
 * Opens a new incident, or updates the already-open one for this
 * `fingerprint` -- never inserts a second row for the same ongoing
 * issue. Never throws: alerting must never be why the caller's own
 * error handling itself fails, so every problem here is logged with
 * console.error and swallowed, and the caller's original error handling
 * proceeds exactly as if this hadn't been called.
 */
export async function raiseOpsAlert(input: RaiseOpsAlertInput): Promise<void> {
  const severity = input.severity ?? 'WARNING';
  const detail = (input.detail ?? '').slice(0, DETAIL_MAX_CHARS);
  const now = new Date();

  try {
    const existing = input.fingerprint
      ? await db.opsAlert.findFirst({
          where: { fingerprint: input.fingerprint, resolvedAt: null },
          orderBy: { createdAt: 'desc' },
        })
      : null; // no fingerprint -- a discrete event, always creates fresh (see RaiseOpsAlertInput's doc comment)

    if (existing) {
      const shouldNotify = severity !== 'INFO' && (!existing.lastNotifiedAt || now.getTime() - existing.lastNotifiedAt.getTime() >= RENOTIFY_INTERVAL_MS);
      await db.opsAlert.update({
        where: { id: existing.id },
        data: {
          severity,
          title: input.title,
          detail,
          lastSeenAt: now,
          occurrenceCount: { increment: 1 },
          ...(shouldNotify ? { lastNotifiedAt: now } : {}),
        },
      });
      if (shouldNotify) {
        await sendAlertEmail('[findmyVybe STILL FAILING]', input.title, [
          `Category: ${input.category} | Severity: ${severity}`,
          `Source: ${input.sourceType}${input.sourceId ? ` (${input.sourceId})` : ''}`,
          `Ongoing since ${existing.createdAt.toISOString()} (${formatDuration(now.getTime() - existing.createdAt.getTime())} so far, ${existing.occurrenceCount + 1} occurrences recorded).`,
          `Latest detail: ${detail || '(none)'}`,
        ]);
      }
      return;
    }

    await db.opsAlert.create({
      data: {
        category: input.category,
        severity,
        title: input.title,
        detail,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        fingerprint: input.fingerprint,
        occurrenceCount: 1,
        lastSeenAt: now,
        lastNotifiedAt: severity === 'INFO' ? null : now,
      },
    });
    if (severity !== 'INFO') {
      await sendAlertEmail(`[findmyVybe ${severity}]`, input.title, [
        `Category: ${input.category} | Severity: ${severity}`,
        `Source: ${input.sourceType}${input.sourceId ? ` (${input.sourceId})` : ''}`,
        `First seen: ${now.toISOString()}`,
        detail || '(no further detail)',
      ]);
    }
  } catch (err) {
    console.error('[ops-alert] failed to raise/update alert', { title: input.title, fingerprint: input.fingerprint, err });
  }
}

/**
 * Closes the open incident for `fingerprint`, if there is one, and
 * emails a "resolved" notice. A no-op (and no email) when nothing is
 * open for that fingerprint -- calling this on every success path is
 * exactly the point (see docs/OPS_ALERTS.md), so it must stay cheap and
 * silent in the overwhelmingly common case where there was never an
 * incident to close.
 */
export async function resolveOpsAlert(input: ResolveOpsAlertInput): Promise<void> {
  try {
    const existing = await db.opsAlert.findFirst({ where: { fingerprint: input.fingerprint, resolvedAt: null } });
    if (!existing) return;

    const now = new Date();
    const detail = input.resolutionDetail ? `${existing.detail}\n\nResolved: ${input.resolutionDetail}`.slice(-DETAIL_MAX_CHARS) : existing.detail;
    await db.opsAlert.update({ where: { id: existing.id }, data: { resolvedAt: now, detail } });

    if (existing.severity !== 'INFO') {
      await sendAlertEmail('[findmyVybe RESOLVED]', existing.title, [
        `Category: ${existing.category} | Was: ${existing.severity}`,
        `Source: ${existing.sourceType}${existing.sourceId ? ` (${existing.sourceId})` : ''}`,
        `Open for ${formatDuration(now.getTime() - existing.createdAt.getTime())} (${existing.occurrenceCount} occurrences recorded) -- cleared ${now.toISOString()}.`,
        input.resolutionDetail || 'The underlying check is succeeding again.',
      ]);
    }
  } catch (err) {
    console.error('[ops-alert] failed to resolve alert', { fingerprint: input.fingerprint, err });
  }
}

/** Convenience for a cron/job route's top-level catch -- same incident shape every job uses. */
export async function raiseCronFailureAlert(jobName: string, err: unknown): Promise<void> {
  await raiseOpsAlert({
    category: 'OUTAGE',
    severity: 'CRITICAL',
    title: `${jobName} cron crashed`,
    detail: errorDetail(err),
    sourceType: 'system',
    sourceId: `cron:${jobName}`,
    fingerprint: `cron:${jobName}`,
  });
}

/** Call from the matching cron's own success path (after raiseCronFailureAlert's try block completes without throwing) to close out a prior crash incident. */
export async function resolveCronFailureAlert(jobName: string): Promise<void> {
  await resolveOpsAlert({ fingerprint: `cron:${jobName}`, resolutionDetail: 'The cron completed a run without error.' });
}

// In-memory, per-warm-instance throttle for call sites that run on
// every request rather than a few times an hour (FCM auth, an OTP
// provider send, the moderation pipeline). This is a VOLUME guard, not
// the incident dedupe -- the fingerprint logic above already prevents
// duplicate rows/emails on its own; this exists purely so an ongoing
// outage doesnt also turn into a raiseOpsAlert() DB round-trip on
// every single blocked request, on top of whatever's already failing.
// Same "mainly helps a single warm instance, not perfectly race-safe,
// good enough" stance lib/notifications/push.ts's own cachedToken
// already takes.
const lastCheckedAt = new Map<string, number>();

/**
 * True at most once per `cooldownMs` for a given `key` on this warm
 * instance. Guard a raiseOpsAlert call with this at any hot, per-request
 * call site; skip it for a cron/job route, which doesn't need it.
 */
export function shouldAlertNow(key: string, cooldownMs = 5 * 60_000): boolean {
  const last = lastCheckedAt.get(key) ?? 0;
  const now = Date.now();
  if (now - last < cooldownMs) return false;
  lastCheckedAt.set(key, now);
  return true;
}
