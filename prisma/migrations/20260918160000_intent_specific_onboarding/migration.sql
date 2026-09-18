-- Intent-specific onboarding: reference tables gain an `intents` scope
-- column, and Profile gains the new per-intent selections (Just Vibing's
-- date-vibe/tonight tags; Rishta Ready's values/future-vibe/children/
-- living-preference fields). All additive, all defaulted — no backfill
-- needed for existing rows.

ALTER TABLE "Interest" ADD COLUMN "intents" "IntentType"[] NOT NULL DEFAULT ARRAY[]::"IntentType"[];
ALTER TABLE "Tribe" ADD COLUMN "intents" "IntentType"[] NOT NULL DEFAULT ARRAY[]::"IntentType"[];
ALTER TABLE "Prompt" ADD COLUMN "intents" "IntentType"[] NOT NULL DEFAULT ARRAY[]::"IntentType"[];

ALTER TABLE "Profile" ADD COLUMN "dateVibeTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Profile" ADD COLUMN "tonightTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Profile" ADD COLUMN "livingPreference" TEXT;
ALTER TABLE "Profile" ADD COLUMN "valuesTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Profile" ADD COLUMN "futureHome" TEXT;
ALTER TABLE "Profile" ADD COLUMN "futureFamily" TEXT;
ALTER TABLE "Profile" ADD COLUMN "futureCareer" TEXT;
ALTER TABLE "Profile" ADD COLUMN "futureMoney" TEXT;
ALTER TABLE "Profile" ADD COLUMN "children" TEXT;
