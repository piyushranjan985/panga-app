-- Mystery Match -- see docs/MYSTERY_MATCH.md. Hand-written, not
-- `prisma migrate dev`-generated: the shadow-database replay of this
-- project's full migration history currently fails on an unrelated,
-- pre-existing ordering bug in 20260926120000_identity_verification_and_
-- photo_moderation (it adds FKs to "ModerationCase" before that table
-- exists -- it's only created one migration later). That migration is
-- already applied and consistent on the real database (`prisma migrate
-- status` reports "Database schema is up to date!" with no drift), so
-- the bug only bites the shadow database used to auto-generate NEW
-- migrations via `migrate dev`. This file's content mirrors exactly what
-- `migrate dev` would otherwise have produced from the schema.prisma
-- changes already committed on `develop` (MysteryCategory enum,
-- Profile.mysteryCategory/mysteryCategorySetAt/mysteryNoLabelsAckAt,
-- the MysteryMatchHistory model, and Match.isMysteryMatch/mysteryCategory/
-- revealedAAt/revealedBAt) -- apply with `prisma migrate deploy`, which
-- applies pending migration folders directly and never touches a shadow
-- database, so this bug doesn't affect it.

-- CreateEnum
CREATE TYPE "MysteryCategory" AS ENUM ('MYSTERY_MATCH', 'VYBE_FLIP', 'NO_LABELS', 'OPTED_OUT');

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "mysteryCategory" "MysteryCategory" NOT NULL DEFAULT 'MYSTERY_MATCH',
ADD COLUMN     "mysteryCategorySetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "mysteryNoLabelsAckAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "isMysteryMatch" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mysteryCategory" "MysteryCategory",
ADD COLUMN     "revealedAAt" TIMESTAMP(3),
ADD COLUMN     "revealedBAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MysteryMatchHistory" (
    "id" TEXT NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "category" "MysteryCategory" NOT NULL,
    "matchId" TEXT,
    "matchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MysteryMatchHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MysteryMatchHistory_userAId_userBId_key" ON "MysteryMatchHistory"("userAId", "userBId");

-- CreateIndex
CREATE INDEX "MysteryMatchHistory_userBId_idx" ON "MysteryMatchHistory"("userBId");

-- AddForeignKey
ALTER TABLE "MysteryMatchHistory" ADD CONSTRAINT "MysteryMatchHistory_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MysteryMatchHistory" ADD CONSTRAINT "MysteryMatchHistory_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
