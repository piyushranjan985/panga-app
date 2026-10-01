import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { getRequestContext } from '@/lib/requestContext';
import { anonymizeUserAccount } from '@/lib/userLifecycle';
import { getDeletionRetentionPolicy, DELETION_RETENTION_CATEGORY } from '@/lib/retentionEnforcement';

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
// just an intent flag, for this one data category. Every other
// RetentionPolicy row (OTP codes, expired swipes, login history) is
// unaffected -- no purge job exists for those yet.
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

  return NextResponse.json({ ok: true, processed, skippedForLegalHold, floorDays });
}
