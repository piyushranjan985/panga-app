import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';
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
      // Anonymize rather than hard-delete: FK cascades on User would take
      // matches/messages/photos with it, destroying evidence a Trust &
      // Safety case or a legal hold might still need. Contact fields and
      // display identity are scrubbed; the row and its history remain.
      await db.$transaction([
        db.user.update({
          where: { id: userId },
          data: {
            status: 'DELETED',
            deletedAt: new Date(),
            statusReason: reason,
            statusChangedAt: new Date(),
            sessionsInvalidatedAt: new Date(),
            email: null,
            phone: null,
            googleId: null,
            facebookId: null,
          },
        }),
        ...(user.profile
          ? [
              db.profile.update({
                where: { userId },
                data: { displayName: 'Deleted user', bio: '', latitude: null, longitude: null },
              }),
            ]
          : []),
      ]);
      newValue = { status: 'DELETED' };
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
