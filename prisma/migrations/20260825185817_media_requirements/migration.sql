-- CreateEnum
CREATE TYPE "MediaViolationAction" AS ENUM ('WARN', 'FORFEIT');

-- AlterTable
ALTER TABLE "Contest" ADD COLUMN     "mediaGraceSeconds" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "mediaViolationAction" "MediaViolationAction" NOT NULL DEFAULT 'WARN',
ADD COLUMN     "requireAudio" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requireVideo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Participant" ADD COLUMN     "audioOn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mediaJoinedAt" TIMESTAMP(3),
ADD COLUMN     "mediaViolationCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "videoOn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "violationSince" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MediaEvent" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MediaEvent_contestId_at_idx" ON "MediaEvent"("contestId", "at");

-- CreateIndex
CREATE INDEX "MediaEvent_contestId_userId_idx" ON "MediaEvent"("contestId", "userId");

-- CreateIndex
CREATE INDEX "Participant_violationSince_idx" ON "Participant"("violationSince");

-- AddForeignKey
ALTER TABLE "MediaEvent" ADD CONSTRAINT "MediaEvent_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
