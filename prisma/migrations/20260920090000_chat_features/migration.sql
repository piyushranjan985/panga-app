-- Adds structured message kinds (tap-to-answer prompts + plan cards),
-- per-user conversation hiding, and a Block relationship -- see the
-- post-match experience rework in app/matches/[matchId]/page.tsx and the
-- new Match Modal on app/discover/page.tsx.

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('TEXT', 'PROMPT', 'PLAN');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN "kind" "MessageKind" NOT NULL DEFAULT 'TEXT';
ALTER TABLE "Message" ADD COLUMN "meta" JSONB;

-- AlterTable
ALTER TABLE "Match" ADD COLUMN "hiddenAAt" TIMESTAMP(3);
ALTER TABLE "Match" ADD COLUMN "hiddenBAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Block" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Block_blockerId_blockedId_key" ON "Block"("blockerId", "blockedId");

-- CreateIndex
CREATE INDEX "Block_blockedId_idx" ON "Block"("blockedId");

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
