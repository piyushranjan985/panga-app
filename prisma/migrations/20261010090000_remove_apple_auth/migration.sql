-- Apple Sign-In removed 2026-10-05 (scaffold only -- APPLE_TEAM_ID/
-- APPLE_CLIENT_ID/APPLE_KEY_ID/APPLE_PRIVATE_KEY were never set in any
-- environment, so "Continue with Apple" always ran the mock-consent
-- fallback, never the real OAuth flow). Column was always nullable and
-- never populated, so this is a safe, lossless drop -- same reasoning as
-- 20260929210000_remove_facebook_auth's facebookId drop.
ALTER TABLE "User" DROP COLUMN "appleId";
