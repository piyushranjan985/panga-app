-- Wrong-guess counter for a single OtpCode row -- see lib/otp.ts's
-- MAX_ATTEMPTS. Existing rows default to 0 (fine: they're all already
-- either consumed or expired by the time this ships).
ALTER TABLE "OtpCode" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
