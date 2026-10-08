-- OpsAlert incident lifecycle -- see docs/OPS_ALERTS.md S2. Hand-written
-- for the same reason the other recent Mystery Match migrations are
-- (the shadow-database replay `prisma migrate dev` needs to auto-generate
-- migrations still fails on the pre-existing ModerationCase FK-ordering
-- bug in 20260926120000_identity_verification_and_photo_moderation).
-- Apply with `prisma migrate deploy`, which never touches a shadow
-- database. All new columns are nullable (or default to a value that
-- preserves every existing row's meaning unchanged) -- no backfill
-- needed, no existing OpsAlert row's behavior changes.

-- AlterTable
ALTER TABLE "OpsAlert" ADD COLUMN     "fingerprint" TEXT,
ADD COLUMN     "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "lastNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "resolvedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "OpsAlert_fingerprint_resolvedAt_idx" ON "OpsAlert"("fingerprint", "resolvedAt");
