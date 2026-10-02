-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "chatOpenAAt" TIMESTAMP(3),
ADD COLUMN     "chatOpenBAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "notifyMatchesMessages" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyReminders" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyVybeVouch" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "VybeVouchInvite" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "inviterUserId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "vetterLabel" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VybeVouchInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VybeVouchResponse" (
    "id" TEXT NOT NULL,
    "inviteId" TEXT NOT NULL,
    "reaction" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VybeVouchResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VybeVouchInvite_token_key" ON "VybeVouchInvite"("token");

-- CreateIndex
CREATE INDEX "VybeVouchInvite_matchId_idx" ON "VybeVouchInvite"("matchId");

-- CreateIndex
CREATE INDEX "VybeVouchInvite_inviterUserId_idx" ON "VybeVouchInvite"("inviterUserId");

-- CreateIndex
CREATE UNIQUE INDEX "VybeVouchResponse_inviteId_key" ON "VybeVouchResponse"("inviteId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");

-- CreateIndex
CREATE INDEX "DeviceToken_userId_idx" ON "DeviceToken"("userId");

-- AddForeignKey
ALTER TABLE "VybeVouchInvite" ADD CONSTRAINT "VybeVouchInvite_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VybeVouchInvite" ADD CONSTRAINT "VybeVouchInvite_inviterUserId_fkey" FOREIGN KEY ("inviterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VybeVouchResponse" ADD CONSTRAINT "VybeVouchResponse_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "VybeVouchInvite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

