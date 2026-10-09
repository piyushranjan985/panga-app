-- Hand-written to match what `prisma migrate dev` would generate from the
-- schema.prisma change -- same situation as
-- 20260926120000_identity_verification_and_photo_moderation's own
-- ALTER TYPE comment: `prisma migrate dev` refused to run here because two
-- unrelated, already-applied migrations have since been edited (their
-- checksums no longer match what's on disk) and it wanted a full
-- `migrate reset` of this database to "fix" that -- not safe to run
-- against a database with real data. This file is exactly the two
-- statements that change implies, written by hand instead.

-- AlterEnum
ALTER TYPE "PhotoModerationDecision" ADD VALUE 'PENDING' BEFORE 'APPROVED';

-- AlterTable
ALTER TABLE "Photo" ALTER COLUMN "moderationStatus" SET DEFAULT 'PENDING';
