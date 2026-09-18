-- Vybe Check moves from free-text answers to a forced binary pick between
-- two fixed options per prompt.
ALTER TABLE "Prompt" ADD COLUMN "optionA" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Prompt" ADD COLUMN "optionB" TEXT NOT NULL DEFAULT '';
