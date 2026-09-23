import { db } from '@/lib/db';

export interface EnforcementCheck {
  blocked: boolean;
  reason?: string;
}

// Trust & Safety enforcement, set exclusively via the admin portal (see
// admin/app/api/users/[userId]/actions/route.ts) writing to User.status /
// messagingRestricted / discoveryRestricted / profileHidden. Checked at the
// specific points where it actually matters (discovering others, swiping,
// sending a message) rather than as a blanket session-level gate, so a
// suspended/banned/restricted user gets a clear, specific error instead of
// a generic "unauthenticated" or the action silently no-op'ing.
export async function checkAccountActive(userId: string): Promise<EnforcementCheck> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { status: true } });
  if (!user) return { blocked: true, reason: 'Account not found.' };
  if (user.status === 'BANNED') return { blocked: true, reason: 'This account has been banned.' };
  if (user.status === 'SUSPENDED') return { blocked: true, reason: 'This account is temporarily suspended.' };
  if (user.status === 'DELETED') return { blocked: true, reason: 'This account has been deleted.' };
  return { blocked: false };
}

export async function checkMessagingAllowed(userId: string): Promise<EnforcementCheck> {
  const active = await checkAccountActive(userId);
  if (active.blocked) return active;
  const user = await db.user.findUnique({ where: { id: userId }, select: { messagingRestricted: true } });
  if (user?.messagingRestricted) return { blocked: true, reason: 'Messaging has been restricted on this account. Contact support if you think this is a mistake.' };
  return { blocked: false };
}
