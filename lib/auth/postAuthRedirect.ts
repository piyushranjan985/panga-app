/**
 * Where a just-signed-in user goes next -- one function, reused by every
 * sign-in call site (phone/email OTP, Google, Apple, passkey, trusted
 * device) instead of each one hand-rolling its own `hasProfile ?
 * '/discover' : '/onboarding'`, which is exactly what stopped being
 * correct once a phone-verify gate was added. See docs/PHONE_FIRST_AUTH.md.
 *
 * Phone number is findmyVybe's primary anti-fake-account signal (see that
 * doc's §1) -- every path that can create a brand-new account (phone OTP
 * itself, Google, Apple) must clear it before reaching onboarding. The
 * gate is keyed on "no profile yet" rather than "just created," which is
 * what makes it automatically skip anyone who already finished onboarding
 * under the old rules (see §3's grandfather decision) -- there is no
 * separate "is this account old or new" flag to maintain.
 */
export function nextPathAfterAuth(user: { phoneVerified: boolean; profile: unknown }): string {
  if (user.profile) return '/discover';
  if (!user.phoneVerified) return '/verify-phone';
  return '/onboarding';
}
