/**
 * Closed-beta gate for every sign-in path (phone OTP, email OTP, the
 * mock Google/Facebook stand-ins, and the real Google/Facebook OAuth
 * callbacks). Before findmyVybe is ready for the public, each of those
 * routes calls isBetaAllowed() with the identifier the visitor is trying
 * to sign in with (a phone number or an email address) and refuses to
 * create an account or session for anyone not on the list.
 *
 * This exists because the app's OTP flow issues a static, publicly-known
 * mock code (see lib/otp.ts -- MOCK_OTP / OTP_PROVIDER="mock", which is
 * the default until a real SMS/email provider is wired up), and the
 * mock-google / mock-facebook routes accept any email with no
 * verification at all. Without this gate, *anyone* who finds the live
 * domain can sign in as any phone number or email address. Real
 * Google/Facebook OAuth already restricts itself to each console's own
 * Test users list while those apps stay unpublished, but this env-var
 * list is the one place *you* control directly, so every entry point
 * checks it the same way regardless of what stage the OAuth apps are in.
 *
 * BETA_ALLOWLIST: comma-separated phone numbers (exactly as you'd type
 * them into the app, e.g. +919876543210) and/or email addresses
 * (case-insensitive). Example: BETA_ALLOWLIST="+919876543210,me@x.com"
 *
 * Leaving it unset or empty means NOBODY can sign in -- this fails
 * closed, not open, so a missing env var can never accidentally reopen
 * the app to the public.
 *
 * BETA_ALLOWLIST_OPEN="true" is the escape hatch for when you're ready
 * to launch for real: it makes isBetaAllowed() return true for everyone
 * without deleting the allowlist or touching any call site.
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
