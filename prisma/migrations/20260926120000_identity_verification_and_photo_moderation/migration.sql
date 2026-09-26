-- Identity verification & photo moderation -- see
-- docs/IDENTITY_VERIFICATION_AND_SAFETY.md. Hand-written (not
-- `prisma migrate dev`-generated) because this sandbox has no network path
-- to the Neon database to run the shadow-database diff -- content mirrors
-- exactly what `migrate dev` would produce from the schema.prisma changes
-- in commit dbf3f78, following this project's existing migration
-- conventions (see e.g. 20260920110000_postmatch_v2 for the same
-- ALTER TYPE ... ADD VALUE pattern already applied successfully here).

-- AlterEnum
ALTER TYPE "VerificationStatus" ADD VALUE 'MANUAL_REVIEW' BEFORE 'VERIFIED';

-- CreateEnum
CREATE TYPE "PhotoModerationDecision" AS ENUM ('APPROVED', 'REJECTED', 'MANUAL_REVIEW');

-- AlterTable
ALTER TABLE "Photo" ADD COLUMN "moderationStatus" "PhotoModerationDecision" NOT NULL DEFAULT 'MANUAL_REVIEW',
                    ADD COLUMN "moderatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Photo_profileId_moderationStatus_idx" ON "Photo"("profileId", "moderationStatus");

-- CreateTable
CREATE TABLE "IdentityVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "documentHash" TEXT NOT NULL,
    "providerReference" TEXT NOT NULL,
    "faceMatchScore" DOUBLE PRECISION,
    "dobMatchedProfile" BOOLEAN NOT NULL DEFAULT true,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "reviewedByAdminId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "moderationCaseId" TEXT,

    CONSTRAINT "IdentityVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhotoModerationResult" (
    "id" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "decision" "PhotoModerationDecision" NOT NULL,
    "faceDetected" BOOLEAN NOT NULL,
    "faceCount" INTEGER NOT NULL,
    "matchedVerifiedFace" BOOLEAN,
    "nudityScore" DOUBLE PRECISION NOT NULL,
    "provider" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "moderationCaseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhotoModerationResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IdentityVerification_documentHash_key" ON "IdentityVerification"("documentHash");

-- CreateIndex
CREATE INDEX "IdentityVerification_userId_idx" ON "IdentityVerification"("userId");

-- CreateIndex
CREATE INDEX "IdentityVerification_status_idx" ON "IdentityVerification"("status");

-- CreateIndex
CREATE INDEX "PhotoModerationResult_photoId_createdAt_idx" ON "PhotoModerationResult"("photoId", "createdAt");

-- AddForeignKey
ALTER TABLE "IdentityVerification" ADD CONSTRAINT "IdentityVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityVerification" ADD CONSTRAINT "IdentityVerification_moderationCaseId_fkey" FOREIGN KEY ("moderationCaseId") REFERENCES "ModerationCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoModerationResult" ADD CONSTRAINT "PhotoModerationResult_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoModerationResult" ADD CONSTRAINT "PhotoModerationResult_moderationCaseId_fkey" FOREIGN KEY ("moderationCaseId") REFERENCES "ModerationCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
