-- Session revocation: a signed session carries the version it was minted at,
-- so bumping this column invalidates every token issued before the bump.
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- Split the overloaded "verificationToken" column into one column per purpose.
-- It previously held, in turn: the Codeforces proof problem, the
-- "SET_PASSWORD_<uuid>" grant, and the password-reset OTP — so starting any one
-- flow destroyed another already in progress.
ALTER TABLE "User" ADD COLUMN "cfVerifyProblem" TEXT;
ALTER TABLE "User" ADD COLUMN "cfVerifyExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "passwordSetupToken" TEXT;
ALTER TABLE "User" ADD COLUMN "passwordSetupExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "resetOtpHash" TEXT;
ALTER TABLE "User" ADD COLUMN "resetOtpExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "resetOtpAttempts" INTEGER NOT NULL DEFAULT 0;

-- Carry over any verification still in flight. Only the Codeforces proof is
-- portable: the old column stored the reset OTP in plaintext and the new one
-- stores a bcrypt hash, and a "SET_PASSWORD_" grant is a 15-minute window that
-- is cheaper to restart than to migrate. Anyone mid-reset requests a new code.
UPDATE "User"
SET "cfVerifyProblem"   = "verificationToken",
    "cfVerifyExpiresAt" = "tokenExpiresAt"
WHERE "verificationToken" ~ '^[0-9]+[A-Z]+$';

ALTER TABLE "User" DROP COLUMN "verificationToken";
ALTER TABLE "User" DROP COLUMN "tokenExpiresAt";
