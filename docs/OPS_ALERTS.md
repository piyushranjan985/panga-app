# Operational Alerting — Design Spec

Status: **Decided — built 2026-10-08, incident lifecycle added 2026-10-08**
Owner: Platform
Related: `lib/ops/alerts.ts`, `prisma/schema.prisma` (`OpsAlert`'s lifecycle
columns), `admin/app/(console)/notifications/page.tsx` (where every alert
this writes shows up), `admin/lib/liveSignals.ts` (the older, complementary
mechanism -- see §4), `docs/MYSTERY_MATCH.md` §10 (the specific gap that
prompted this)

## 0. What this is, in one paragraph

Before this, `OpsAlert` rows only ever came from a human clicking "Log as
alert" on the admin Notifications page -- `admin/lib/liveSignals.ts`'s own
comment said so explicitly ("this app has no background job runner, so
there is no automatic monitor writing OpsAlert rows on its own"). That
stopped being true the moment this app got real background jobs (Vercel
Cron, then Mystery Match's QStash-driven delivery worker) -- any of those,
or any integration the app depends on, can now fail with nobody watching.
`lib/ops/alerts.ts` is the fix, and it's an INCIDENT TRACKER, not a log:
one open row per distinct failure mode, updated in place while it's still
happening, closed out with its own "resolved" notice the moment the
underlying thing starts working again. Nothing on the admin side needed a
new page -- every alert from here lands in the same `OpsAlert` table and
the same "Open alerts" list a human's own manual click already used.

## 1. The three things PKR asked this to guarantee

1. **Don't flood the table or the inbox for every single failure** -- only
   for a real, ongoing component/integration/job failure, and only once
   per occurrence of that failure, not once per failed request.
2. **When an issue resolves, say so** -- a "RESOLVED" email, and the
   dashboard row itself updated (not left looking perpetually "open").
3. **A persisting or repeating issue still gets re-raised, on a sane
   cadence** -- "once per 2 hours or something like that," not silence for
   the rest of the day and not a fresh email every few minutes either.

§2 is the mechanism behind all three.

## 2. The incident lifecycle

Every system-raised alert has a `fingerprint` -- a stable string identifying
WHICH recurring issue this is (`integration:fcm-push`, `cron:mystery-match`,
...). `raiseOpsAlert({ fingerprint, ... })`:

- Looks for an already-OPEN row (`resolvedAt: null`) with that exact
  fingerprint.
- **Found one** -> updates that SAME row: `occurrenceCount` increments,
  `lastSeenAt` bumps to now, `detail`/`title`/`severity` refresh to this
  occurrence's values (so the dashboard always shows the latest failure,
  not the first). No new row. Emails again ONLY if `lastNotifiedAt` is
  more than `OPS_ALERT_RENOTIFY_MINUTES` ago (default 120) -- that's the
  "once per 2 hours while it persists" cadence, and the email it sends
  says "STILL FAILING" with the occurrence count and how long it's been
  open, not a copy of the original.
- **Found none** -> creates a new row (`occurrenceCount: 1`) and emails
  immediately (a genuinely new issue always notifies right away -- the
  2-hour throttle only applies to repeats of an issue already known about).

`resolveOpsAlert({ fingerprint, resolutionDetail? })` is the other half --
call it from the SUCCESS path of whatever `raiseOpsAlert` call it mirrors.
It looks for an open row with that fingerprint; if there is one, sets
`resolvedAt = now` and sends exactly one "RESOLVED" email (how long it was
open, how many occurrences); if there isn't one (the overwhelmingly common
case -- nothing was wrong), it does nothing at all. This is why it's safe
to call unconditionally on a success path: the no-op case is one cheap
indexed lookup (on the `[fingerprint, resolvedAt]` index), never a write.

`INFO` severity never emails, on either side of the lifecycle -- it's a
dashboard-only record, "worth remembering," not "someone should look now."

## 3. The two throttles, and why there are two of them

**The re-notify cadence (`OPS_ALERT_RENOTIFY_MINUTES`, default 120,
DB-backed via `lastNotifiedAt`).** This is what satisfies "once per 2
hours or something like that" for an issue that's still ongoing. It's
stored on the row itself, so it's correct across serverless cold starts
and across however many concurrent function instances are handling
traffic -- there's exactly one open row per fingerprint, so there's
exactly one source of truth for "when did we last email about this."

**`shouldAlertNow` (in-memory, 5 minutes, per-warm-instance).** A
PRE-FILTER in front of `raiseOpsAlert` itself, used only at the three
per-request hot-path call sites (`lib/notifications/push.ts`, `lib/otp.ts`,
`lib/safety/moderateAndUpload.ts`) -- not at a cron route, which already
only runs a few times an hour and whose failure is worth its own call
every time (see `raiseCronFailureAlert`). Without this, an ongoing outage
at one of those three sites would call `raiseOpsAlert` on every single
blocked request -- each one cheap individually (one lookup + one row
update, never a flood of new rows thanks to §2), but still unnecessary
load piled onto a database that may already be part of the problem. This
throttle is purely about VOLUME OF DB CALLS during an incident; it has
nothing to do with whether an email goes out -- that's entirely §2's job.
Same "good enough for a single instance, not perfectly race-safe, resets
on cold start" stance `lib/notifications/push.ts`'s pre-existing
`cachedToken` already takes elsewhere in this exact file.

Note the asymmetry: the FAILURE path is throttled (`shouldAlertNow`), the
SUCCESS/resolve path is NOT. A resolve-check is one indexed lookup that's
a no-op the moment nothing is open -- cheap enough to run on every request
unconditionally, and doing so is what makes auto-resolution fire promptly
instead of waiting for a lucky retry.

## 4. How this relates to `admin/lib/liveSignals.ts`

Different problem, deliberately not merged. `getLiveSignals()` computes
*product/ops conditions from existing data* fresh on every page load (an
overdue `PrivacyRequest`, an escalated `SupportTicket`) -- there's no event
to hook, so polling the data at view-time is the only option, and a human
decides whether a given one is worth tracking (no occurrence-counting or
auto-resolve concept at all -- a human acknowledges it once and that's
that). `raiseOpsAlert`/`resolveOpsAlert` are for *discrete failure events a
piece of code already knows about the instant they happen* -- there's a
real event to hook on both ends (the failure AND the recovery), so the code
raises and resolves it itself. Both land in the same `OpsAlert` table and
the same admin page on purpose; they're complementary entry points, not
two competing systems.

## 5. Stateful incidents vs. one-off events

Most call sites represent a CONTINUING condition -- "FCM is down" is true
or false at any given moment, and can flip back. Those get a `fingerprint`
and both halves of the lifecycle (§2).

A few represent a discrete, already-over-by-the-time-we-know-about-it EVENT
instead -- nothing "ongoing" to track or later resolve. Mystery Match's
hard-cutoff sweep (`app/api/cron/mystery-match-deliver`) is the one example
today: by the time it fires, today's 7:30-8:30pm IST window has already
fully closed, so there's no "wait for it to clear" moment, ever, for that
specific day's instance of the problem. Those calls omit `fingerprint`
entirely, which makes `raiseOpsAlert` create-and-notify unconditionally,
every time. That's safe specifically because every such call site is
already capped at roughly once a day by its own cron schedule -- omitting
the fingerprint on a per-request hot-path call site would flood the table,
so don't.

## 6. What calls this today

| Call site | Fingerprint | Category / Severity | Why |
|---|---|---|---|
| `app/api/cron/mystery-match` — QStash scheduling fails | `cron:mystery-match:qstash-schedule` | OUTAGE / WARNING | Delivery falls back to one inline burst instead of the 7:30-8:30pm spread; nobody misses a notification, timing just degrades. Resolved next day's run if scheduling succeeds. |
| `app/api/cron/mystery-match` — any uncaught error | `cron:mystery-match` | OUTAGE / CRITICAL | `raiseCronFailureAlert`/`resolveCronFailureAlert` — a whole day's pairing run never happened. |
| `app/api/cron/mystery-match-deliver` — QStash re-wake fails | `cron:mystery-match-deliver:qstash-rewake` | OUTAGE / WARNING | One link in the delivery chain broke; resolved the next time a rewake succeeds (same run or a later one). |
| `app/api/cron/mystery-match-deliver` — hard-cutoff sweep finds leftover `PENDING` rows | *(none — discrete event, §5)* | OUTAGE / CRITICAL | Real users never got today's Mystery Match notification; already over by the time this fires. |
| `app/api/cron/mystery-match-deliver` — any uncaught error | `cron:mystery-match-deliver` | OUTAGE / CRITICAL | `raiseCronFailureAlert`/`resolveCronFailureAlert`. |
| `app/api/cron/otp-cleanup` — any uncaught error | `cron:otp-cleanup` | OUTAGE / CRITICAL | Low-stakes on its own, but a cheap canary for "this project's DB connection is broken." |
| `app/api/cron/date-feedback-nudge` — any uncaught error | `cron:date-feedback-nudge` | OUTAGE / CRITICAL | `raiseCronFailureAlert`/`resolveCronFailureAlert`. (Per-user push failures inside its loop stay plain `console.error` — see §7.) |
| `lib/notifications/push.ts` — `getAccessToken` fails / next succeeds | `integration:fcm-push` | OUTAGE / CRITICAL | Blocks every push notification app-wide (new matches, messages, Mystery Match, Vybe Vouch, reminders) — not a per-user issue. |
| `lib/otp.ts` — `issueOtp`'s provider send fails / next succeeds | `integration:otp-phone` or `integration:otp-email` | OUTAGE / CRITICAL | Blocks sign-in/sign-up on that whole channel, not just one request. Phone and email tracked as separate incidents. |
| `lib/safety/moderateAndUpload.ts` — `moderateImageBuffer`'s provider call fails / next succeeds | `integration:image-moderation` | OUTAGE / CRITICAL | Every photo upload is being hard-rejected regardless of actual content (see that function's own comment on why it fails closed). |

## 7. What deliberately does NOT call this (and why)

- A single push failing to one device (`lib/notifications/push.ts`'s
  per-token send loop) — expected and routine; a stale/uninstalled token is
  already handled by revoking it, not by alerting anyone.
- `date-feedback-nudge`'s per-user `sendPushToUser` try/catch — one user's
  push failing is noise; the systemic version of that failure (FCM itself
  down) is already caught once, loudly, inside `push.ts` itself.
- A `MysteryMatchNotification` row retried after one failed attempt (see
  `lib/mysteryMatchDelivery.ts`) — only the hard-cutoff sweep (genuinely
  stuck rows) is alert-worthy, not every transient retry.
- Manual admin actions (user suspension, moderation decisions, etc.) — not
  failures, nothing to alert on.

## 8. Adding a new call site (the "going forward" part)

Ask: would this failure otherwise be invisible until a user complains, or
until someone happens to check Vercel's function logs? If yes, it's a
candidate. Then:

1. **Stateful or event?** (§5) Can the underlying thing go back to working
   on its own, and would you want to know when it does? Stateful ->
   give it a `fingerprint` and call `resolveOpsAlert` from its success
   path. Event, naturally capped at roughly once a day by its own
   schedule -> omit `fingerprint`.
2. **Category**: `OUTAGE` for "a mechanism/pipeline/integration is broken
   or stalled"; `SYSTEM` for a narrower, isolated technical failure;
   leave `SECURITY`/`MODERATION`/`SLA_BREACH`/`PAYMENT`/`VERIFICATION`/
   `PRIVACY` to the product-condition alerts `liveSignals.ts` already owns.
3. **Severity**: `CRITICAL` if it blocks something app-wide or an entire
   user-facing flow; `WARNING` if there's a working fallback or the blast
   radius is small; `INFO` only for "worth a record, nobody needs to act."
4. **Title**: a stable sentence describing the FAILURE TYPE, never a
   specific incident (no ids, no timestamps — `detail` is for that, and a
   varying title would start a new incident on every call instead of
   updating the open one).
5. **Throttle the failure path** with `shouldAlertNow(key)` if the call
   site runs on a per-request hot path; skip it for a cron/job route.
6. **If stateful**, call `resolveOpsAlert` unconditionally on the matching
   success path — no `shouldAlertNow`-style guard needed there (§3).

This is the standing convention for this codebase going forward, not just
for the call sites in §6 — any new integration, provider, or background job
added later should get both halves of this wired the same way, without
needing to be asked each time.
