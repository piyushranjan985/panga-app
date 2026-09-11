-- Multi-auth: phone becomes optional (one of several sign-in methods now,
-- not the only one), and email/Google/Facebook identity columns are added.
-- The User table was created back when phone was the only sign-in method
-- (see 20260910123259_init) and was never migrated when the multi-method
-- auth rewrite landed in the app code — this migration catches the
-- database up to what prisma/schema.prisma has described since then.

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "phone" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "email" TEXT;
ALTER TABLE "User" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "googleId" TEXT;
ALTER TABLE "User" ADD COLUMN "facebookId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "User_facebookId_key" ON "User"("facebookId");
