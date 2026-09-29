-- Facebook login removed 2026-09-29 (Meta Business Verification requires a
-- registered business entity findmyVybe doesn't have; most dating apps have
-- themselves moved away from Facebook login in favor of phone + Google).
-- Column was always nullable and never populated (FACEBOOK_APP_ID/SECRET
-- were never set in any environment), so this is a safe, lossless drop.
ALTER TABLE "User" DROP COLUMN "facebookId";
