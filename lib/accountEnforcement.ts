import { db } from '@/lib/db';

export interface EnforcementCheck {
  blocked: boolean;
  reason?: string;
}

// Trust & Safety enforcement, set exclusively via the admin portal (see
// admin/app/api/users/[userId]/actions/route.ts) writing to User.status /
// messagingRestricted / discoveryRestricted / profileHidden -- plus, per
// docs/IDENTITY_VERIFICATION_AND_SAFETY.md section 1, mandatory identity
// verification (Profile.verification). Checked at the specific points
// where it actually matters (discovering others, swiping, sending a
// message) rather than as a blanket session-level gate, so a
// suspended/banned/restricted/unverified user gets a clear, specific error
// instead of a generic "unauthenticated" or the action silently no-op'ing.
//
// Deliberately does NOT block onboarding/profile-editing/photo-upload
// routes (none of them call this) -- a user has to be able to finish
// onboarding and start identity verification before they could ever
// become VERIFIED in the first place.
export async function checkAccountActive(userId: string): Promise<EnforcementCheck> {
  const [user, profile] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { status: true } }),
    db.profile.findUnique({ where: { userId }, select: { verification: true } }),
  ]);
  if (!user) return { blocked: true, reason: 'Account not found.' };
  if (user.status === 'BANNED') return { blocked: true, reason: 'This account has been banned.' };
  if (user.status === 'SUSPENDED') return { blocked: true, reason: 'This account is temporarily suspended.' };
  if (user.status === 'DELETED') return { blocked: true, reason: 'This account has been deleted.' };
  if (!profile) return { blocked: true, reason: 'Finish onboarding first.' };
  if (profile.verification !== 'VERIFIED') {
    return {
      blocked: true,
      reason:
        profile.verification === 'MANUAL_REVIEW'
          ? "We're still reviewing your identity verification — check back shortly."
          : profile.verification === 'REJECTED'
            ? 'Identity verification failed — please try again from your profile.'
            : 'Verify your identity to unlock discovery, matching, and messaging.',
    };
  }
  return { blocked: false };
}

export async function checkMessagingAllowed(userId: string): Promise<EnforcementCheck> {
  const active = await checkAccountActive(userId);
  if (active.blocked) return active;
  const user = await db.user.findUnique({ where: { id: userId }, select: { messagingRestricted: true } });
  if (user?.messagingRestricted) return { blocked: true, reason: 'Messaging has been restricted on this account. Contact support if you think this is a mistake.' };
  return { blocked: false };
}
