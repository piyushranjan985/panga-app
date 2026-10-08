import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { getRequestContext } from '@/lib/requestContext';
import { anonymizeUserAccount } from '@/lib/userLifecycle';
import {
  getDeletionRetentionPolicy,
  DELETION_RETENTION_CATEGORY,
  getSwipeRetentionPolicy,
  getMessageRetentionPolicy,
} from '@/lib/retentionEnforcement';

export const dynamic = 'force-dynamic';

// Scheduled by admin/vercel.json's `crons` entry. Closes the loop the
// Retention Policies page (admin/app/(console)/privacy/retention) has
// always advertised but never ran: a DPDP DELETION request now completes
// itself -- same effect as an admin clicking "Completed" on
// /privacy/requests -- once its user has been soft-deleted
// (app/api/me/delete/route.ts) past the DELETION_RETENTION_CATEGORY
// policy's retentionDays (default DEFAULT_DELETION_RETENTION_DAYS; see
// retentionEnforcement.ts), provided no active LegalHold blocks it, and
// only while that policy row's autoDeleteEnabled is on -- so the toggle on
// the Retention Policies page is this job's actual on/off switch, not
// just an intent flag, for this one data category.
//
// Two more RetentionPolicy categories are handled further down in this
// same job -- "Expired/unmatched swipes" and "Ended-match conversation
// messages" (see docs/DATA_RETENTION.md, main app, for the full design
// and the competitor/regulatory research behind the numbers). Both
// follow the identical shape: fully built, each independently gated by
// its own row's autoDeleteEnabled (both start false), each skipping any
// user under an active LegalHold. OTP codes and login/session history
// still have no purge job -- those RetentionPolicy rows remain
// documentation-only for now.
//
// Trust-and-safety-driven removals (the admin "Delete account" user
// action) are a different, deliberately-immediate path
// (admin/lib/userLifecycle.ts's doc comment) and are untouched here --
// this job only ever acts on open DELETION PrivacyRequests.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured; refusing to run an unauthenticated purge.' }, { status: 500 });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { floorDays, autoDeleteEnabled } = await getDeletionRetentionPolicy();
  if (!autoDeleteEnabled) {
    return NextResponse.json({ ok: true, skipped: `autoDeleteEnabled is off for "${DELETION_RETENTION_CATEGORY}"`, processed: 0 });
  }

  const cutoff = new Date(Date.now() - floorDays * 86_400_000);

  const candidates = await db.privacyRequest.findMany({
    where: {
      type: 'DELETION',
      status: { in: ['RECEIVED', 'VERIFYING_IDENTITY', 'IN_PROGRESS'] },
      userId: { not: null },
      user: { status: 'DELETED', deletedAt: { not: null, lte: cutoff } },
    },
    select: { id: true, userId: true },
  });

  let processed = 0;
  let skippedForLegalHold = 0;
  const context = await getRequestContext();

  for (const candidate of candidates) {
    if (!candidate.userId) continue;

    const hold = await db.legalHold.findFirst({ where: { userId: candidate.userId, active: true } });
    if (hold) {
      await db.privacyRequest.update({ where: { id: candidate.id }, data: { status: 'ON_HOLD_LEGAL', legalHoldId: hold.id } });
      skippedForLegalHold++;
      continue;
    }

    await anonymizeUserAccount(candidate.userId, `Automatic retention-floor purge (${floorDays}-day DPDP deletion window elapsed)`);
    await db.privacyRequest.update({
      where: { id: candidate.id },
      data: {
        status: 'COMPLETED',
        resolutionNote: `Auto-completed by the retention purge job after the ${floorDays}-day minimum retention window.`,
        completedAt: new Date(),
      },
    });
    await writeAudit({
      actorId: null,
      actorEmail: 'system:retention-cron',
      action: 'privacy.request.completed',
      category: 'privacy',
      targetType: 'PrivacyRequest',
      targetId: candidate.id,
      newValue: { status: 'COMPLETED', automatic: true },
      reason: `Automatic ${floorDays}-day retention floor purge`,
      context,
    });
    processed++;
  }

  // --- Expired/unmatched swipes -------------------------------------
  // Raw SQL (same Prisma.sql/$executeRaw pattern lib/discoverPool.ts
  // introduced this engagement) -- a correlated NOT EXISTS/anti-join
  // like this isn't expressible through the normal query builder. Only
  // ever deletes a PASS swipe, or a VYBE swipe that never became a
  // Match -- a VYBE that DID lead to a Match is the origin of a real,
  // possibly still-active relationship and is never touched by this
  // policy regardless of age. Deliberately changes product behavior
  // when turned on: a profile passed on (or liked-but-not-reciprocated)
  // more than floorDays ago becomes swipeable/visible in Discover again,
  // since nothing else records "already seen" -- see
  // docs/DATA_RETENTION.md (main app) S1 for why that's the intended
  // trade, not a bug.
  const { floorDays: swipeFloorDays, autoDeleteEnabled: swipePurgeEnabled } = await getSwipeRetentionPolicy();
  let swipesPurged = 0;
  if (swipePurgeEnabled) {
    const swipeCutoff = new Date(Date.now() - swipeFloorDays * 86_400_000);
    swipesPurged = await db.$executeRaw`
      DELETE FROM "Swipe" s
      WHERE s."createdAt" < ${swipeCutoff}
        AND (
          s.action = 'PASS'
          OR NOT EXISTS (
            SELECT 1 FROM "Match" m
            WHERE (m."userAId" = s."fromUserId" AND m."userBId" = s."toUserId")
               OR (m."userAId" = s."toUserId" AND m."userBId" = s."fromUserId")
          )
        )
        AND s."fromUserId" NOT IN (SELECT "userId" FROM "LegalHold" WHERE active = true AND "userId" IS NOT NULL)
        AND s."toUserId" NOT IN (SELECT "userId" FROM "LegalHold" WHERE active = true AND "userId" IS NOT NULL)
    `;
    if (swipesPurged > 0) {
      await writeAudit({
        actorId: null,
        actorEmail: 'system:retention-cron',
        action: 'retention.swipes.purged',
        category: 'privacy',
        targetType: 'RetentionPolicy',
        newValue: { purged: swipesPurged, floorDays: swipeFloorDays },
        reason: `Automatic ${swipeFloorDays}-day expired/unmatched-swipe purge`,
        context,
      });
    }
  }

  // --- Ended-match conversation messages ------------------------------
  // Scoped by the MATCH's unmatchedAt, not each message's own createdAt
  // -- an active match's history, however old, is never touched. Only
  // Message rows are deleted; the Match row itself is kept (tiny, and
  // useful for aggregate "you've had N matches" history/safety
  // investigations without retaining conversation content). MessageLike
  // rows cascade-delete automatically (see the schema's onDelete:
  // Cascade on MessageLike.messageId).
  const { floorDays: messageFloorDays, autoDeleteEnabled: messagePurgeEnabled } = await getMessageRetentionPolicy();
  let messagesPurged = 0;
  if (messagePurgeEnabled) {
    const messageCutoff = new Date(Date.now() - messageFloorDays * 86_400_000);
    messagesPurged = await db.$executeRaw`
      DELETE FROM "Message"
      WHERE "matchId" IN (
        SELECT m.id FROM "Match" m
        WHERE m."unmatchedAt" IS NOT NULL
          AND m."unmatchedAt" < ${messageCutoff}
          AND m."userAId" NOT IN (SELECT "userId" FROM "LegalHold" WHERE active = true AND "userId" IS NOT NULL)
          AND m."userBId" NOT IN (SELECT "userId" FROM "LegalHold" WHERE active = true AND "userId" IS NOT NULL)
      )
    `;
    if (messagesPurged > 0) {
      await writeAudit({
        actorId: null,
        actorEmail: 'system:retention-cron',
        action: 'retention.messages.purged',
        category: 'privacy',
        targetType: 'RetentionPolicy',
        newValue: { purged: messagesPurged, floorDays: messageFloorDays },
        reason: `Automatic ${messageFloorDays}-day ended-match-message purge`,
        context,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    processed,
    skippedForLegalHold,
    floorDays,
    swipesPurged,
    swipePurgeEnabled,
    messagesPurged,
    messagePurgeEnabled,
  });
}
