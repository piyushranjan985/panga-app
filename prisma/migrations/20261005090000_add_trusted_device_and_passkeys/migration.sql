-- Trusted device + passkeys -- see docs/PHONE_FIRST_AUTH.md. Hand-written,
-- not `prisma migrate dev`-generated, same reason as the two previous
-- hand-written migrations in this project (the shadow-database replay of
-- this project's full migration history fails on an unrelated,
-- pre-existing ordering bug -- see 20261003152128_add_mystery_match's
-- migration.sql for the long version). Apply with `prisma migrate deploy`.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "appleId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_appleId_key" ON "User"("appleId");

-- CreateTable
CREATE TABLE "TrustedDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,

    CONSTRAINT "TrustedDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrustedDevice_tokenHash_key" ON "TrustedDevice"("tokenHash");

-- CreateIndex
CREATE INDEX "TrustedDevice_userId_idx" ON "TrustedDevice"("userId");

-- AddForeignKey
ALTER TABLE "TrustedDevice" ADD CONSTRAINT "TrustedDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "WebAuthnCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "transports" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deviceType" TEXT NOT NULL,
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebAuthnCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebAuthnCredential_credentialId_key" ON "WebAuthnCredential"("credentialId");

-- CreateIndex
CREATE INDEX "WebAuthnCredential_userId_idx" ON "WebAuthnCredential"("userId");

-- AddForeignKey
ALTER TABLE "WebAuthnCredential" ADD CONSTRAINT "WebAuthnCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
