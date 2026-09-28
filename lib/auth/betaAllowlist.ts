/**
 * Access gate for the mock Google/Facebook sign-in stand-ins and the
 * real Google/Facebook OAuth callbacks. isBetaAllowed() is checked with
 * the identifier the visitor is trying to sign in with (an email
 * address) and refuses to create an account or session for anyone not
 * on the list.
 *
 * Phone/email OTP sign-in does NOT use this -- that path is
 * intentionally open to any phone number or email address, gated
 * instead by a fixed, never-displayed code (see lib/otp.ts). This list
 * covers the two paths that don't have an equivalent code-based gate:
 * mock-google/mock-facebook accept any email with zero verification at
 * all, and real Google/Facebook OAuth only restricts itself to each
 * console's own Test users list while those apps stay unpublished (once
 * published, this list becomes the only thing still restricting them).
 *
 * BETA_ALLOWLIST: comma-separated email addresses (case-insensitive)
 * allowed to use these two sign-in methods. Example:
 * BETA_ALLOWLIST="me@x.com,tester@y.com"
 *
 * Leaving it unset or empty means NOBODY can sign in via Google/Facebook
 * -- this fails closed, not open, so a missing env var can never
 * accidentally reopen those two methods to the public.
 *
 * BETA_ALLOWLIST_OPEN="true" is the escape hatch for when you're ready
 * to open Google/Facebook sign-in to the public too: it makes
 * isBetaAllowed() return true for everyone without deleting the
 * allowlist or touching any call site.
 */

function parseAllowlist(): Set<string> {
  const raw = process.env.BETA_ALLOWLIST ?? '';
  return new Set(
    raw
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isBetaAllowed(identifier: string | null | undefined): boolean {
  if (process.env.BETA_ALLOWLIST_OPEN === 'true') return true;
  if (!identifier) return false;
  return parseAllowlist().has(identifier.trim().toLowerCase());
}

export const BETA_LOCKED_MESSAGE =
  "findmyVybe isn't open to the public yet — this number/email isn't on the invite list.";
