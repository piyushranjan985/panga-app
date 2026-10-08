-- Mystery Match delivery pipeline -- see docs/MYSTERY_MATCH.md S10.
-- Hand-written for the same reason 20261003152128_add_mystery_match is:
-- the shadow-database replay used by `prisma migrate dev` to auto-generate
-- migrations still fails on the pre-existing ModerationCase FK-ordering
-- bug in 20260926120000_identity_verification_and_photo_moderation.
-- Apply with `prisma migrate deploy`, which never touches a shadow
-- database. Content mirrors exactly what `migrate dev` would otherwise
-- have produced from the schema.prisma changes already committed
-- (MysteryNotificationStatus enum, the MysteryMatchNotification model,
-- and its two relations onto User and Match).

-- CreateEnum
CREATE TYPE "MysteryNotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "MysteryMatchNotification" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "otherUserId" TEXT NOT NULL,
    "category" "MysteryCategory" NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "MysteryNotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MysteryMatchNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MysteryMatchNotification_status_scheduledFor_idx" ON "MysteryMatchNotification"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "MysteryMatchNotification_runId_idx" ON "MysteryMatchNotification"("runId");

-- AddForeignKey
ALTER TABLE "MysteryMatchNotification" ADD CONSTRAINT "MysteryMatchNotification_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MysteryMatchNotification" ADD CONSTRAINT "MysteryMatchNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
