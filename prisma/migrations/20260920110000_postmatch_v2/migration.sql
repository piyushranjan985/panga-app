-- AlterEnum
ALTER TYPE "MessageKind" ADD VALUE 'VIDEO_VYBE';

-- AlterTable
ALTER TABLE "Match" ADD COLUMN "mutedAAt" TIMESTAMP(3),
                     ADD COLUMN "mutedBAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DateFeedback" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" TEXT NOT NULL,
    "wantsToKeepChatting" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DateFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DateFeedback_matchId_userId_key" ON "DateFeedback"("matchId", "userId");

-- AddForeignKey
ALTER TABLE "DateFeedback" ADD CONSTRAINT "DateFeedback_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DateFeedback" ADD CONSTRAINT "DateFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
