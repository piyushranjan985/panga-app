-- Add tagline to Interest: a playful first-person phrase shown on the
-- discover reveal card instead of the plain label. Existing rows get ''
-- as a placeholder; the reseed (npm run db:seed) that accompanies this
-- migration replaces every Interest row's label/emoji/tagline anyway.
ALTER TABLE "Interest" ADD COLUMN "tagline" TEXT NOT NULL DEFAULT '';
