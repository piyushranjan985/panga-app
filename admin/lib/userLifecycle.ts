import { db } from '@/lib/db';

// Shared by the Users "Delete account" action (Trust & Safety /
// enforcement-driven) and the Privacy Centre's DELETION request
// completion (DPDP data-principal-erasure-driven) -- two different
// reasons to end up here, one place that actually does it, so the scrub
// can't drift between the two paths. Anonymizes rather than hard-deletes:
// FK cascades on User would take matches/messages/photos with it, and a
// moderation case or legal hold may still need that history.
export async function anonymizeUserAccount(userId: string, reason: string | undefined) {
  const user = await db.user.findUnique({ where: { id: userId }, include: { profile: true } });
  if (!user) return null;

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
      ? [db.profile.update({ where: { userId }, data: { displayName: 'Deleted user', bio: '', latitude: null, longitude: null } })]
      : []),
  ]);

  return user;
}
