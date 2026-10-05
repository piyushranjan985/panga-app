-- OTP security hardening -- see docs/OTP_SECURITY.md. Hand-written, not
-- `prisma migrate dev`-generated, same reason as the previous hand-written
-- migrations in this project (the shadow-database replay of this
-- project's full migration history fails on an unrelated, pre-existing
-- ordering bug -- see 20261003152128_add_mystery_match's migration.sql
-- for the long version). Apply with `prisma migrate deploy`.

-- CreateEnum
CREATE TYPE "OtpChannel" AS ENUM ('PHONE', 'EMAIL');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('SIGNUP', 'LOGIN', 'PHONE_CHANGE', 'EMAIL_CHANGE');

-- AlterTable
-- All four nullable: existing rows predate this tracking and stay null
-- forever (they're ephemeral, already-expired data the new cleanup cron
-- purges on its own schedule regardless) -- only rows written by the
-- updated lib/otp.ts populate these going forward.
ALTER TABLE "OtpCode"
  ADD COLUMN "destination" TEXT,
  ADD COLUMN "channel" "OtpChannel",
  ADD COLUMN "purpose" "OtpPurpose",
  ADD COLUMN "requestIp" TEXT,
  ADD COLUMN "clientId" TEXT;

-- CreateIndex
CREATE INDEX "OtpCode_destination_createdAt_idx" ON "OtpCode"("destination", "createdAt");

-- CreateIndex
CREATE INDEX "OtpCode_requestIp_createdAt_idx" ON "OtpCode"("requestIp", "createdAt");

-- CreateIndex
CREATE INDEX "OtpCode_expiresAt_idx" ON "OtpCode"("expiresAt");
