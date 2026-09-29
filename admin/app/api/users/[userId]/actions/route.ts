import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';
import { anonymizeUserAccount } from '@/lib/userLifecycle';
import type { Permission } from '@/lib/rbac';

const ACTIONS = [
  'warn',
  'suspend',
  'unsuspend',
  'ban',
  'unban',
  'forceLogout',
  'resetVerification',
  'restrictMessaging',
  'unrestrictMessaging',
  'restrictDiscovery',
  'unrestrictDiscovery',
  'hideProfile',
  'unhideProfile',
  'removePhoto',
  'deleteAccount',
  'restoreAccount',
] as const;
type Action = (typeof ACTIONS)[number];

const ACTION_PERMISSION: Record<Action, Permission> = {
  warn: 'users.action.warn',
  suspend: 'users.action.suspend',
  unsuspend: 'users.action.suspend',
  ban: 'users.action.ban',
  unban: 'users.action.ban',
  forceLogout: 'users.action.forceLogout',
  resetVerification: 'users.action.resetVerification',
  restrictMessaging: 'users.action.restrictMessaging',
  unrestrictMessaging: 'users.action.restrictMessaging',
  restrictDiscovery: 'users.action.restrictDiscovery',
  unrestrictDiscovery: 'users.action.restrictDiscovery',
  hideProfile: 'users.action.hideProfile',
  unhideProfile: 'users.action.hideProfile',
  removePhoto: 'users.action.removePhoto',
  deleteAccount: 'users.action.deleteAccount',
  // Reuses deleteAccount's permission (and, via STEP_UP_REQUIRED, its
  // step-up requirement) rather than a new permission -- same pattern as
  // ban/unban and suspend/unsuspend above, both reusing one permission
  // for the reversible pair.
  restoreAccount: 'users.action.deleteAccount',
};

const bodySchema = z.object({
  action: z.enum(ACTIONS),
  reason: z.string().trim().min(1).max(2000).optional(),
  photoId: z.string().optional(),
});

// One dispatcher for every "User Actions" button in the spec, rather than
// fourteen near-identical routes -- ACTION_PERMISSION is what each one is
// actually gated by (and, via lib/rbac.ts STEP_UP_REQUIRED, whether it
// also demands step-up), and every branch below ends the same way: a
// snapshot audit entry via writeAudit(). Nothing here is reversible from
// the UI without also being its own logged action (e.g. ban vs. unban).
export async function POST(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const { action, reason, photoId } = parsed.data;

  const guard = await requirePermission(ACTION_PERMISSION[action]);
  if ('error' in guard) return guard.error;
  const { admin } = guard;

  const user = await db.user.findUnique({ where: { id: userId }, include: { profile: true } });
  if (!user) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const context = await getRequestContext();
  const previousValue = {
    status: user.status,
    messagingRestricted: user.messagingRestricted,
    discoveryRestricted: user.discoveryRestricted,
    profileHidden: user.profileHidden,
    verification: user.profile?.verification,
  };
  let newValue: Record<string, unknown> = {};

  switch (action) {
    case 'warn': {
      await db.user.update({ where: { id: userId }, data: { status: 'WARNED', statusReason: reason, statusChangedAt: new Date() } });
      newValue = { status: 'WARNED' };
      break;
    }
    case 'suspend': {
      await db.user.update({ where: { id: userId }, data: { status: 'SUSPENDED', statusReason: reason, statusChangedAt: new Date() } });
      newValue = { status: 'SUSPENDED' };
      break;
    }
    case 'unsuspend': {
      await db.user.update({ where: { id: userId }, data: { status: 'ACTIVE', statusReason: reason, statusChangedAt: new Date() } });
      newValue = { status: 'ACTIVE' };
      break;
    }
    case 'ban': {
      await db.user.update({
        where: { id: userId },
        data: { status: 'BANNED', statusReason: reason, statusChangedAt: new Date(), sessionsInvalidatedAt: new Date() },
      });
      newValue = { status: 'BANNED' };
      break;
    }
    case 'unban': {
      await db.user.update({ where: { id: userId }, data: { status: 'ACTIVE', statusReason: reason, statusChangedAt: new Date() } });
      newValue = { status: 'ACTIVE' };
      break;
    }
    case 'forceLogout': {
      await db.user.update({ where: { id: userId }, data: { sessionsInvalidatedAt: new Date() } });
      newValue = { sessionsInvalidatedAt: 'now' };
      break;
    }
    case 'resetVerification': {
      if (user.profile) {
        await db.profile.update({ where: { userId }, data: { verification: 'UNVERIFIED' } });
      }
      newValue = { verification: 'UNVERIFIED' };
      break;
    }
    case 'restrictMessaging': {
      await db.user.update({ where: { id: userId }, data: { messagingRestricted: true } });
      newValue = { messagingRestricted: true };
      break;
    }
    case 'unrestrictMessaging': {
      await db.user.update({ where: { id: userId }, data: { messagingRestricted: false } });
      newValue = { messagingRestricted: false };
      break;
    }
    case 'restrictDiscovery': {
      await db.user.update({ where: { id: userId }, data: { discoveryRestricted: true } });
      newValue = { discoveryRestricted: true };
      break;
    }
    case 'unrestrictDiscovery': {
      await db.user.update({ where: { id: userId }, data: { discoveryRestricted: false } });
      newValue = { discoveryRestricted: false };
      break;
    }
    case 'hideProfile': {
      await db.user.update({ where: { id: userId }, data: { profileHidden: true } });
      newValue = { profileHidden: true };
      break;
    }
    case 'unhideProfile': {
      await db.user.update({ where: { id: userId }, data: { profileHidden: false } });
      newValue = { profileHidden: false };
      break;
    }
    case 'removePhoto': {
      if (!photoId) return NextResponse.json({ error: 'photoId is required.' }, { status: 400 });
      const photo = await db.photo.findFirst({ where: { id: photoId, profile: { userId } } });
      if (!photo) return NextResponse.json({ error: 'Photo not found.' }, { status: 404 });
      await db.photo.update({ where: { id: photoId }, data: { removedAt: new Date(), removedReason: reason } });
      newValue = { photoId, removed: true };
      break;
    }
    case 'deleteAccount': {
      await anonymizeUserAccount(userId, reason);
      newValue = { status: 'DELETED' };
      break;
    }
    case 'restoreAccount': {
      // Only meaningful for the self-service soft-delete path
      // (app/api/me/delete in the consumer app) -- if this account was
      // instead removed via 'deleteAccount' above (or a completed DPDP
      // erasure), anonymizeUserAccount already nulled its
      // phone/email/googleId/facebookId, so flipping status back to ACTIVE
      // here can't restore sign-in; it's left as a no-op-ish status change
      // rather than a blocked action, since there's no harm in it and no
      // reliable way from here to tell 'identity wiped' apart from
      // 'somehow never had one'.
      if (user.status !== 'DELETED') {
        return NextResponse.json({ error: 'Account is not deleted.' }, { status: 400 });
      }
      await db.user.update({
        where: { id: userId },
        data: { status: 'ACTIVE', statusReason: reason, statusChangedAt: new Date(), deletedAt: null },
      });
      // A self-service delete files an open PrivacyRequest (see
      // app/api/me/delete/route.ts in the consumer app) so the compliance
      // queue knows to anonymize this account once the retention window
      // passes -- restoring the account means that request no longer
      // applies, so close out anything still open for it rather than
      // leaving a stale DELETION request pointed at an ACTIVE user.
      await db.privacyRequest.updateMany({
        where: { userId, type: 'DELETION', status: { in: ['RECEIVED', 'VERIFYING_IDENTITY', 'IN_PROGRESS'] } },
        data: {
          status: 'REJECTED',
          handledById: admin.id,
          resolutionNote: reason || 'Account restored via admin support action; user withdrew the deletion request.',
          completedAt: new Date(),
        },
      });
      newValue = { status: 'ACTIVE' };
      break;
    }
  }

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: `user.${action}`,
    category: 'user',
    targetType: 'User',
    targetId: userId,
    previousValue,
    newValue,
    reason,
    context,
  });

  return NextResponse.json({ ok: true });
}
