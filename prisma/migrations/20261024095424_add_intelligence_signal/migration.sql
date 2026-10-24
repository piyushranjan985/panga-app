-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "intelligenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "intelligenceScoreUpdatedAt" TIMESTAMP(3);
