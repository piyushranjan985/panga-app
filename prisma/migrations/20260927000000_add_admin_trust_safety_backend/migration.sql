-- Backfill migration: the entire admin / trust-and-safety / privacy-ops
-- backend (AdminUser, AdminSession, AuditLogEntry, ModerationCase,
-- ModerationNote, ModerationAppeal, SupportTicket, TicketMessage,
-- ConsentRecord, PrivacyRequest, LegalHold, PrivacyIncident,
-- PrivacyIncidentEvent, DataProcessor, RetentionPolicy, ProcessingActivity,
-- FeatureFlag, AppConfigChange, NotificationTemplate, OpsAlert,
-- LoginEvent -- plus the related moderation/account-status enums and a few
-- columns on User/Photo) was applied directly to production at some point
-- with `prisma db push`, bypassing migration tracking entirely. It was
-- never captured in any tracked migration, which only surfaced now, when
-- `prisma migrate deploy` was replayed from scratch against a brand-new
-- (dev) database for the first time and failed with a missing-relation
-- error on "ModerationCase".
--
-- This file was generated with:
--   prisma migrate diff --from-config-datasource ... --to-schema prisma/schema.prisma --script
-- run against the dev database (which had migrations up through
-- 20260926120000_identity_verification_and_photo_moderation applied) so
-- its content is verified against actual schema.prisma, not hand-typed.
-- It deliberately excludes the "OtpCode.attempts" column, which is
-- already tracked by migration 20260928111709_add_otp_attempts and runs
-- right after this one.
--
-- Applied to dev via a normal `migrate deploy`. Marked as already-applied
-- on production via `prisma migrate resolve --applied` without re-running
-- this SQL there, since production's live schema already has every one of
-- these tables (confirmed via `prisma migrate diff --from-config-datasource
-- ... --to-schema prisma/schema.prisma --script` against production
-- returning "This is an empty migration." -- i.e. zero drift).

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'WARNED', 'SUSPENDED', 'BANNED', 'DELETED');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'OPERATIONS', 'TRUST_AND_SAFETY', 'MODERATOR', 'CUSTOMER_SUPPORT', 'PRIVACY_OFFICER', 'COMPLIANCE_OFFICER', 'FINANCE', 'ANALYTICS', 'READ_ONLY');

-- CreateEnum
CREATE TYPE "ModerationSourceType" AS ENUM ('USER_REPORT', 'AUTOMATED_FLAG', 'CONTENT_REVIEW', 'ADMIN_INITIATED');

-- CreateEnum
CREATE TYPE "ModerationSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ModerationCaseStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'ESCALATED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('PENDING', 'UPHELD', 'OVERTURNED');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_ON_USER', 'ESCALATED', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TicketChannel" AS ENUM ('VYBEHELP_ESCALATION', 'EMAIL', 'IN_APP_FORM', 'ADMIN_CREATED');

-- CreateEnum
CREATE TYPE "ConsentPurpose" AS ENUM ('ACCOUNT_ESSENTIAL', 'PRECISE_LOCATION', 'MARKETING_COMMUNICATIONS', 'ANALYTICS', 'THIRD_PARTY_SHARING');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('GRANTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "PrivacyRequestType" AS ENUM ('ACCESS', 'CORRECTION', 'DELETION', 'GRIEVANCE', 'PORTABILITY', 'CONSENT_WITHDRAWAL');

-- CreateEnum
CREATE TYPE "PrivacyRequestStatus" AS ENUM ('RECEIVED', 'VERIFYING_IDENTITY', 'IN_PROGRESS', 'ON_HOLD_LEGAL', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PrivacyIncidentSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "PrivacyIncidentStatus" AS ENUM ('DETECTED', 'ASSESSING', 'CONTAINED', 'BOARD_NOTIFIED', 'USERS_NOTIFIED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ConfigChangeStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'APPLIED');

-- CreateEnum
CREATE TYPE "OpsAlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "OpsAlertCategory" AS ENUM ('SECURITY', 'MODERATION', 'SLA_BREACH', 'SYSTEM', 'PAYMENT', 'VERIFICATION', 'PRIVACY', 'OUTAGE');

-- AlterTable
ALTER TABLE "Photo" ADD COLUMN     "removedAt" TIMESTAMP(3),
ADD COLUMN     "removedReason" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletionRequestedAt" TIMESTAMP(3),
ADD COLUMN     "discoveryRestricted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "messagingRestricted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "profileHidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sessionsInvalidatedAt" TIMESTAMP(3),
ADD COLUMN     "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "statusChangedAt" TIMESTAMP(3),
ADD COLUMN     "statusReason" TEXT;

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'READ_ONLY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mfaSecret" TEXT,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaRecoveryCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminSession" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "stepUpAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLogEntry" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "previousValue" JSONB,
    "newValue" JSONB,
    "reason" TEXT,
    "requestId" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationCase" (
    "id" TEXT NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "sourceType" "ModerationSourceType" NOT NULL,
    "reportId" TEXT,
    "category" TEXT NOT NULL,
    "severity" "ModerationSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "ModerationCaseStatus" NOT NULL DEFAULT 'OPEN',
    "assigneeId" TEXT,
    "slaDueAt" TIMESTAMP(3),
    "riskScore" DOUBLE PRECISION,
    "evidence" JSONB,
    "isRepeatOffender" BOOLEAN NOT NULL DEFAULT false,
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModerationCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationNote" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationAppeal" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "AppealStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationAppeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "subject" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priority" "TicketPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "channel" "TicketChannel" NOT NULL DEFAULT 'IN_APP_FORM',
    "assigneeId" TEXT,
    "slaDueAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "vybeHelpTranscript" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorType" TEXT NOT NULL,
    "authorAdminId" TEXT,
    "body" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "ConsentPurpose" NOT NULL,
    "status" "ConsentStatus" NOT NULL,
    "noticeVersion" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivacyRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "contactEmail" TEXT,
    "type" "PrivacyRequestType" NOT NULL,
    "status" "PrivacyRequestStatus" NOT NULL DEFAULT 'RECEIVED',
    "description" TEXT NOT NULL DEFAULT '',
    "dueAt" TIMESTAMP(3),
    "handledById" TEXT,
    "resolutionNote" TEXT,
    "exportFileUrl" TEXT,
    "exportExpiresAt" TIMESTAMP(3),
    "legalHoldId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PrivacyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalHold" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "reason" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "LegalHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivacyIncident" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "PrivacyIncidentSeverity" NOT NULL,
    "status" "PrivacyIncidentStatus" NOT NULL DEFAULT 'DETECTED',
    "affectedUserCount" INTEGER,
    "affectedDataCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "containedAt" TIMESTAMP(3),
    "boardNotifiedAt" TIMESTAMP(3),
    "usersNotifiedAt" TIMESTAMP(3),
    "rootCause" TEXT,
    "remediation" TEXT,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivacyIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivacyIncidentEvent" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrivacyIncidentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataProcessor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "dataCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "country" TEXT NOT NULL DEFAULT 'India',
    "contractRef" TEXT,
    "dpaSignedAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataProcessor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionPolicy" (
    "id" TEXT NOT NULL,
    "dataCategory" TEXT NOT NULL,
    "retentionDays" INTEGER NOT NULL,
    "autoDeleteEnabled" BOOLEAN NOT NULL DEFAULT false,
    "legalBasis" TEXT NOT NULL DEFAULT '',
    "lastReviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetentionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessingActivity" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "dataCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "legalBasis" TEXT NOT NULL,
    "dataSubjects" TEXT NOT NULL DEFAULT 'App users (Data Principals)',
    "recipients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "retentionCategoryRef" TEXT,
    "crossBorderTransfer" BOOLEAN NOT NULL DEFAULT false,
    "dpiaRequired" BOOLEAN NOT NULL DEFAULT false,
    "dpiaDocUrl" TEXT,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessingActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rolloutPercent" INTEGER NOT NULL DEFAULT 100,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppConfigChange" (
    "id" TEXT NOT NULL,
    "configKey" TEXT NOT NULL,
    "previousValue" JSONB,
    "proposedValue" JSONB NOT NULL,
    "status" "ConfigChangeStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "proposedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "AppConfigChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsAlert" (
    "id" TEXT NOT NULL,
    "category" "OpsAlertCategory" NOT NULL,
    "severity" "OpsAlertSeverity" NOT NULL DEFAULT 'WARNING',
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "sourceType" TEXT,
    "sourceId" TEXT,
    "acknowledgedById" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpsAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "platform" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE INDEX "AdminUser_role_idx" ON "AdminUser"("role");

-- CreateIndex
CREATE INDEX "AdminSession_adminId_idx" ON "AdminSession"("adminId");

-- CreateIndex
CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditLogEntry_actorId_createdAt_idx" ON "AuditLogEntry"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLogEntry_targetType_targetId_idx" ON "AuditLogEntry"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditLogEntry_category_createdAt_idx" ON "AuditLogEntry"("category", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLogEntry_createdAt_idx" ON "AuditLogEntry"("createdAt");

-- CreateIndex
CREATE INDEX "ModerationCase_status_severity_idx" ON "ModerationCase"("status", "severity");

-- CreateIndex
CREATE INDEX "ModerationCase_subjectUserId_idx" ON "ModerationCase"("subjectUserId");

-- CreateIndex
CREATE INDEX "ModerationCase_assigneeId_idx" ON "ModerationCase"("assigneeId");

-- CreateIndex
CREATE INDEX "ModerationCase_sourceType_idx" ON "ModerationCase"("sourceType");

-- CreateIndex
CREATE INDEX "ModerationNote_caseId_createdAt_idx" ON "ModerationNote"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "ModerationAppeal_caseId_idx" ON "ModerationAppeal"("caseId");

-- CreateIndex
CREATE INDEX "ModerationAppeal_status_idx" ON "ModerationAppeal"("status");

-- CreateIndex
CREATE INDEX "SupportTicket_status_priority_idx" ON "SupportTicket"("status", "priority");

-- CreateIndex
CREATE INDEX "SupportTicket_userId_idx" ON "SupportTicket"("userId");

-- CreateIndex
CREATE INDEX "SupportTicket_assigneeId_idx" ON "SupportTicket"("assigneeId");

-- CreateIndex
CREATE INDEX "TicketMessage_ticketId_createdAt_idx" ON "TicketMessage"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "ConsentRecord_userId_purpose_createdAt_idx" ON "ConsentRecord"("userId", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX "PrivacyRequest_status_type_idx" ON "PrivacyRequest"("status", "type");

-- CreateIndex
CREATE INDEX "PrivacyRequest_userId_idx" ON "PrivacyRequest"("userId");

-- CreateIndex
CREATE INDEX "LegalHold_userId_active_idx" ON "LegalHold"("userId", "active");

-- CreateIndex
CREATE INDEX "PrivacyIncident_status_severity_idx" ON "PrivacyIncident"("status", "severity");

-- CreateIndex
CREATE INDEX "PrivacyIncidentEvent_incidentId_createdAt_idx" ON "PrivacyIncidentEvent"("incidentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RetentionPolicy_dataCategory_key" ON "RetentionPolicy"("dataCategory");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFlag_key_key" ON "FeatureFlag"("key");

-- CreateIndex
CREATE INDEX "AppConfigChange_configKey_status_idx" ON "AppConfigChange"("configKey", "status");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationTemplate_key_key" ON "NotificationTemplate"("key");

-- CreateIndex
CREATE INDEX "OpsAlert_category_severity_createdAt_idx" ON "OpsAlert"("category", "severity", "createdAt");

-- CreateIndex
CREATE INDEX "OpsAlert_acknowledgedAt_idx" ON "OpsAlert"("acknowledgedAt");

-- CreateIndex
CREATE INDEX "LoginEvent_userId_createdAt_idx" ON "LoginEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- Moved here from 20260926120000_identity_verification_and_photo_moderation
-- (fixed 2026-10-03): both reference "ModerationCase", which this
-- migration creates above -- it doesn't exist yet at the point the prior
-- migration runs, so a from-scratch replay of full migration history
-- (e.g. prisma migrate dev's shadow database) failed on these exact two
-- lines before this fix.
-- AddForeignKey
ALTER TABLE "IdentityVerification" ADD CONSTRAINT "IdentityVerification_moderationCaseId_fkey" FOREIGN KEY ("moderationCaseId") REFERENCES "ModerationCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoModerationResult" ADD CONSTRAINT "PhotoModerationResult_moderationCaseId_fkey" FOREIGN KEY ("moderationCaseId") REFERENCES "ModerationCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminUser" ADD CONSTRAINT "AdminUser_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLogEntry" ADD CONSTRAINT "AuditLogEntry_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationCase" ADD CONSTRAINT "ModerationCase_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationCase" ADD CONSTRAINT "ModerationCase_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationCase" ADD CONSTRAINT "ModerationCase_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationNote" ADD CONSTRAINT "ModerationNote_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ModerationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationNote" ADD CONSTRAINT "ModerationNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAppeal" ADD CONSTRAINT "ModerationAppeal_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ModerationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAppeal" ADD CONSTRAINT "ModerationAppeal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAppeal" ADD CONSTRAINT "ModerationAppeal_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_authorAdminId_fkey" FOREIGN KEY ("authorAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivacyRequest" ADD CONSTRAINT "PrivacyRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivacyRequest" ADD CONSTRAINT "PrivacyRequest_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivacyRequest" ADD CONSTRAINT "PrivacyRequest_legalHoldId_fkey" FOREIGN KEY ("legalHoldId") REFERENCES "LegalHold"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalHold" ADD CONSTRAINT "LegalHold_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalHold" ADD CONSTRAINT "LegalHold_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivacyIncident" ADD CONSTRAINT "PrivacyIncident_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivacyIncidentEvent" ADD CONSTRAINT "PrivacyIncidentEvent_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "PrivacyIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivacyIncidentEvent" ADD CONSTRAINT "PrivacyIncidentEvent_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessingActivity" ADD CONSTRAINT "ProcessingActivity_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureFlag" ADD CONSTRAINT "FeatureFlag_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppConfigChange" ADD CONSTRAINT "AppConfigChange_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppConfigChange" ADD CONSTRAINT "AppConfigChange_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationTemplate" ADD CONSTRAINT "NotificationTemplate_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsAlert" ADD CONSTRAINT "OpsAlert_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoginEvent" ADD CONSTRAINT "LoginEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

