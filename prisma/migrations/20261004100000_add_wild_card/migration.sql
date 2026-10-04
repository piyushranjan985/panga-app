-- Wild Card -- see docs/WILD_CARD.md. Hand-written, not `prisma migrate
-- dev`-generated, same reason as 20261003152128_add_mystery_match's
-- migration.sql (the shadow-database replay of this project's full
-- migration history fails on an unrelated, pre-existing ordering bug in
-- 20260926120000_identity_verification_and_photo_moderation -- that
-- migration is already applied and consistent on the real database, so
-- the bug only bites `migrate dev`'s shadow database, never `migrate
-- deploy`, which applies pending migration folders directly). This file's
-- content mirrors exactly what `migrate dev` would otherwise have
-- produced from the schema.prisma changes already committed on `develop`
-- (the WildCardUse model) -- apply with `prisma migrate deploy`.

-- CreateTable
CREATE TABLE "WildCardUse" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "candidateUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WildCardUse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WildCardUse_userId_createdAt_idx" ON "WildCardUse"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "WildCardUse" ADD CONSTRAINT "WildCardUse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WildCardUse" ADD CONSTRAINT "WildCardUse_candidateUserId_fkey" FOREIGN KEY ("candidateUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
