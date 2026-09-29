import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, destroySession } from '@/lib/session';
import { writeAudit } from '@/lib/audit';

/**
 * Self-service "Delete my account" (app/profile/page.tsx's Danger Zone).
 * Deliberately a SOFT delete, not the admin portal's anonymizeUserAccount
 * (admin/lib/userLifecycle.ts) -- those two exist for different reasons and
 * shouldn't share behavior:
 *
 *  - anonymizeUserAccount nulls phone/email/googleId/facebookId immediately.
 *    Right for a Trust & Safety-driven removal or a DPDP deletion request
 *    the compliance team has already confirmed and completed -- irreversible
 *    on purpose.
 *  - This route just flips status to DELETED and blocks sign-in (see the six
 *    sign-in routes' DELETED_ACCOUNT_MESSAGE check, and getSession()'s own
 *    backstop in lib/session.ts). Every identity field, and all of the
 *    user's actual data, stays exactly as it was -- both because the person
 *    might change their mind, and because the IT (Intermediary Guidelines)
 *    Rules, 2021, Rule 3(1)(h) require retaining a deactivated account's
 *    records for a minimum of 180 days for investigation purposes (longer if
 *    a LegalHold is active). NOT LEGAL ADVICE -- confirm this figure with
 *    counsel before relying on it; see app/privacy/page.tsx's "Delete your
 *    data" section, which describes this same flow to users.
 *
 * This also files a PrivacyRequest (type DELETION, status RECEIVED) so the
 * request shows up in the existing admin Privacy Requests queue -- once the
 * retention window has passed and no LegalHold blocks it, an admin
 * completes it there exactly like any other DPDP erasure request, which is
 * what actually triggers anonymizeUserAccount (see
 * admin/app/api/privacy/requests/[requestId]/route.ts). Nothing here
 * schedules that automatically; it's a manual compliance-team step by
 * design, same as every other PrivacyRequest.
 *
 * "Support can enable the login again": admin/app/api/users/[userId]/actions
 * route's `restoreAccount` action sets status back to ACTIVE (only
 * meaningful before anonymization has happened, i.e. exactly the window
 * this route creates).
 */
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });

  // Idempotent: a second call (double-click, retried request) just confirms
  // rather than erroring or double-filing a PrivacyRequest.
  if (user.status === 'DELETED') {
    await destroySession();
    return NextResponse.json({ ok: true, alreadyDeleted: true });
  }

  const now = new Date();
  const previousStatus = user.status;

  await db.$transaction([
    db.user.update({
      where: { id: user.id },
      data: {
        status: 'DELETED',
        deletedAt: now,
        deletionRequestedAt: user.deletionRequestedAt ?? now,
        statusReason: 'Self-service deletion requested from profile page',
        statusChangedAt: now,
        // Signs this user out on every device/browser right away, not just
        // this one -- see lib/session.ts's getSession() comment.
        sessionsInvalidatedAt: now,
      },
    }),
    db.privacyRequest.create({
      data: {
        userId: user.id,
        type: 'DELETION',
        status: 'RECEIVED',
        description:
          'Self-service account deletion requested from the profile page. ' +
          'Minimum retention: do not complete (anonymize) before 180 days from deletedAt ' +
          '(IT Rules, 2021, Rule 3(1)(h)) unless legal counsel confirms otherwise, and not at all ' +
          'while a LegalHold is active for this user.',
      },
    }),
  ]);

  await writeAudit({
    actorEmail: user.email ?? user.phone ?? `user:${user.id}`,
    action: 'user.self_delete',
    category: 'privacy',
    targetType: 'User',
    targetId: user.id,
    previousValue: { status: previousStatus },
    newValue: { status: 'DELETED' },
    reason: 'Self-service deletion requested from profile page',
  });

  await destroySession();

  return NextResponse.json({ ok: true });
}
