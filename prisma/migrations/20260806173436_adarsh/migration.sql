-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('WAITING', 'IN_PROGRESS', 'FINISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ContestStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'FINISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ContestMode" AS ENUM ('BLITZ', 'CLASSIC', 'LOCKOUT');

-- CreateEnum
CREATE TYPE "PointingSystem" AS ENUM ('ICPC', 'POINTS');

-- CreateEnum
CREATE TYPE "HostingType" AS ENUM ('PLAYER_HOST', 'SUPERVISED');

-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('HOST', 'GUEST', 'SUPERVISOR', 'PLAYER_1', 'PLAYER_2');

-- CreateEnum
CREATE TYPE "MatchResult" AS ENUM ('WIN', 'LOSS', 'DRAW');

-- CreateEnum
CREATE TYPE "TagMatchMode" AS ENUM ('ANY', 'ALL');

-- CreateEnum
CREATE TYPE "SeriesStatus" AS ENUM ('IN_PROGRESS', 'FINISHED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "avatar" TEXT NOT NULL,
    "rating" INTEGER NOT NULL DEFAULT 0,
    "maxRating" INTEGER NOT NULL DEFAULT 0,
    "rank" TEXT NOT NULL DEFAULT 'unrated',
    "maxRank" TEXT NOT NULL DEFAULT 'unrated',
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT,
    "passwordHash" TEXT,
    "verificationToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "elo" INTEGER NOT NULL DEFAULT 1200,
    "peakElo" INTEGER NOT NULL DEFAULT 1200,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "bestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "guestId" TEXT,
    "hostingType" "HostingType" NOT NULL DEFAULT 'PLAYER_HOST',
    "player1Id" TEXT,
    "player2Id" TEXT,
    "status" "RoomStatus" NOT NULL DEFAULT 'WAITING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "rematchOfCode" TEXT,
    "seriesId" TEXT,
    "gameNumber" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contest" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" "ContestMode" NOT NULL,
    "pointingSystem" "PointingSystem" NOT NULL DEFAULT 'ICPC',
    "problemCount" INTEGER NOT NULL DEFAULT 3,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "minRating" INTEGER NOT NULL DEFAULT 800,
    "maxRating" INTEGER NOT NULL DEFAULT 1600,
    "allowedTags" TEXT[],
    "excludedTags" TEXT[],
    "seed" TEXT NOT NULL,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "status" "ContestStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "tagMatchMode" "TagMatchMode" NOT NULL DEFAULT 'ANY',
    "isSolo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Contest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Problem" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "problemKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "tags" TEXT[],
    "indexInContest" INTEGER NOT NULL,
    "lockedWinnerId" TEXT,

    CONSTRAINT "Problem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Participant" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ParticipantRole" NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "penalty" INTEGER NOT NULL DEFAULT 0,
    "acceptedCount" INTEGER NOT NULL DEFAULT 0,
    "isWinner" BOOLEAN NOT NULL DEFAULT false,
    "hasResigned" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cfSubmissionId" BIGINT NOT NULL,
    "verdict" TEXT NOT NULL,
    "passedTestCount" INTEGER NOT NULL DEFAULT 0,
    "timeSubmitted" TIMESTAMP(3) NOT NULL,
    "solveTimeSeconds" INTEGER,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roomCode" TEXT NOT NULL,
    "opponentHandle" TEXT NOT NULL,
    "mode" "ContestMode" NOT NULL,
    "result" "MatchResult" NOT NULL,
    "userScore" INTEGER NOT NULL,
    "opponentScore" INTEGER NOT NULL,
    "duration" INTEGER NOT NULL,
    "playedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eloChange" INTEGER NOT NULL DEFAULT 0,
    "eloAfter" INTEGER NOT NULL DEFAULT 1200,

    CONSTRAINT "MatchHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchSeries" (
    "id" TEXT NOT NULL,
    "bestOf" INTEGER NOT NULL DEFAULT 3,
    "player1Id" TEXT NOT NULL,
    "player2Id" TEXT,
    "player1Wins" INTEGER NOT NULL DEFAULT 0,
    "player2Wins" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "status" "SeriesStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "winnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactMessage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_handle_key" ON "User"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_elo_idx" ON "User"("elo" DESC);

-- CreateIndex
CREATE INDEX "User_wins_idx" ON "User"("wins" DESC);

-- CreateIndex
CREATE INDEX "User_lastSeenAt_idx" ON "User"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "Room_code_key" ON "Room"("code");

-- CreateIndex
CREATE INDEX "Room_status_createdAt_idx" ON "Room"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Room_isPublic_status_createdAt_idx" ON "Room"("isPublic", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Room_hostId_idx" ON "Room"("hostId");

-- CreateIndex
CREATE INDEX "Room_guestId_idx" ON "Room"("guestId");

-- CreateIndex
CREATE INDEX "Room_player1Id_idx" ON "Room"("player1Id");

-- CreateIndex
CREATE INDEX "Room_player2Id_idx" ON "Room"("player2Id");

-- CreateIndex
CREATE INDEX "Room_seriesId_idx" ON "Room"("seriesId");

-- CreateIndex
CREATE UNIQUE INDEX "Contest_roomId_key" ON "Contest"("roomId");

-- CreateIndex
CREATE INDEX "Contest_status_idx" ON "Contest"("status");

-- CreateIndex
CREATE INDEX "Problem_contestId_idx" ON "Problem"("contestId");

-- CreateIndex
CREATE UNIQUE INDEX "Problem_contestId_indexInContest_key" ON "Problem"("contestId", "indexInContest");

-- CreateIndex
CREATE INDEX "Participant_userId_idx" ON "Participant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Participant_contestId_userId_key" ON "Participant"("contestId", "userId");

-- CreateIndex
CREATE INDEX "Submission_contestId_timeSubmitted_idx" ON "Submission"("contestId", "timeSubmitted");

-- CreateIndex
CREATE INDEX "Submission_userId_idx" ON "Submission"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_contestId_cfSubmissionId_key" ON "Submission"("contestId", "cfSubmissionId");

-- CreateIndex
CREATE INDEX "MatchHistory_userId_playedAt_idx" ON "MatchHistory"("userId", "playedAt" DESC);

-- CreateIndex
CREATE INDEX "MatchHistory_roomCode_idx" ON "MatchHistory"("roomCode");

-- CreateIndex
CREATE INDEX "MatchSeries_player1Id_idx" ON "MatchSeries"("player1Id");

-- CreateIndex
CREATE INDEX "MatchSeries_player2Id_idx" ON "MatchSeries"("player2Id");

-- CreateIndex
CREATE INDEX "ContactMessage_createdAt_idx" ON "ContactMessage"("createdAt" DESC);

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_player1Id_fkey" FOREIGN KEY ("player1Id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_player2Id_fkey" FOREIGN KEY ("player2Id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "MatchSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contest" ADD CONSTRAINT "Contest_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Problem" ADD CONSTRAINT "Problem_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchHistory" ADD CONSTRAINT "MatchHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchSeries" ADD CONSTRAINT "MatchSeries_player1Id_fkey" FOREIGN KEY ("player1Id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchSeries" ADD CONSTRAINT "MatchSeries_player2Id_fkey" FOREIGN KEY ("player2Id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
