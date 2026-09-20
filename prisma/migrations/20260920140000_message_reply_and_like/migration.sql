-- AlterTable
ALTER TABLE "Message" ADD COLUMN "replyToId" TEXT;

-- CreateTable
CREATE TABLE "MessageLike" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageLike_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageLike_messageId_idx" ON "MessageLike"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageLike_messageId_userId_key" ON "MessageLike"("messageId", "userId");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLike" ADD CONSTRAINT "MessageLike_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLike" ADD CONSTRAINT "MessageLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
