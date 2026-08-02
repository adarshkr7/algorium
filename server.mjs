import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";
import { PrismaClient } from "@prisma/client";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
const prisma = new PrismaClient();

// In-memory active room socket state: roomCode -> Map of socket IDs & userHandles
const activeRooms = new Map();
// Active contests watcher map: contestId -> Interval
const contestWatchers = new Map();

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error handling request:", err);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });

  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  // Helper: Fetch Codeforces user submissions
  async function fetchCFSubmissions(userHandle, count = 200) {
    if (!userHandle) return [];
    try {
      const res = await fetch(
        `https://codeforces.com/api/user.status?handle=${encodeURIComponent(userHandle)}&from=1&count=${count}`
      );
      const data = await res.json();
      if (data.status === "OK" && data.result) {
        return data.result;
      }
    } catch (err) {
      console.error(`CF fetch error for ${userHandle}:`, err.message);
    }
    return [];
  }

  // Poll submissions for an active contest
  async function pollContestSubmissions(contestId) {
    try {
      const contest = await prisma.contest.findUnique({
        where: { id: contestId },
        include: {
          room: { include: { host: true, guest: true, player1: true, player2: true } },
          problems: { orderBy: { indexInContest: "asc" } },
          participants: { include: { user: true } },
          submissions: true,
        },
      });

      if (!contest || contest.status === "FINISHED" || !contest.startTime) {
        if (contestWatchers.has(contestId)) {
          clearInterval(contestWatchers.get(contestId));
          contestWatchers.delete(contestId);
        }
        return;
      }

      const startTime = new Date(contest.startTime);
      const now = new Date();
      const durationMs = contest.durationMinutes * 60 * 1000;
      const endTime = contest.endTime || new Date(startTime.getTime() + durationMs);

      // Check timer expiration
      if (now >= endTime) {
        await finishContest(contest);
        return;
      }

      const player1 = contest.room.player1 || contest.room.host;
      const player2 = contest.room.player2 || contest.room.guest;
      if (!player1 || !player2) return;

      const existingCfIds = new Set(contest.submissions.map((s) => Number(s.cfSubmissionId)));

      const [p1Subs, p2Subs] = await Promise.all([
        fetchCFSubmissions(player1.handle),
        fetchCFSubmissions(player2.handle),
      ]);

      // Process submissions for a given user
      async function processUserSubs(user, subs) {
        if (!user || !subs) return;
        for (const sub of subs) {
          if (!sub.id || existingCfIds.has(sub.id)) continue;

          // Check if submission occurred after contest start
          const subTime = new Date(sub.creationTimeSeconds * 1000);
          if (subTime < startTime || subTime > endTime) continue;

          // Check if submission matches one of our contest problems
          if (!sub.problem || !sub.problem.contestId || !sub.problem.index) continue;
          const formattedIndex = String(sub.problem.index).trim().toUpperCase();
          const key = `${sub.problem.contestId}-${formattedIndex}`;
          const targetProblem = contest.problems.find((p) => p.problemKey === key);

          if (!targetProblem) continue;

          const solveTimeSec = Math.max(0, Math.floor((subTime.getTime() - startTime.getTime()) / 1000));

          // Save submission to database
          const createdSub = await prisma.submission.create({
            data: {
              contestId: contest.id,
              problemId: targetProblem.id,
              userId: user.id,
              cfSubmissionId: BigInt(sub.id),
              verdict: sub.verdict || "TESTING",
              passedTestCount: sub.passedTestCount || 0,
              timeSubmitted: subTime,
              solveTimeSeconds: sub.verdict === "OK" ? solveTimeSec : null,
            },
            include: { user: true, problem: true },
          });

          existingCfIds.add(sub.id);

          // Emit live submission alert to room (Recent Actions)
          io.to(contest.room.code).emit("new-recent-action", {
            type: "SUBMISSION",
            action: {
              ...createdSub,
              cfSubmissionId: createdSub.cfSubmissionId.toString(),
            },
          });

          // Blitz mode unlock / lock logic
          if (contest.mode === "BLITZ" && sub.verdict === "OK") {
            const currentUnlocked = contest.problems.find((p) => !p.lockedWinnerId);
            if (currentUnlocked && currentUnlocked.id === targetProblem.id) {
              await prisma.problem.update({
                where: { id: targetProblem.id },
                data: { lockedWinnerId: user.id },
              });
              targetProblem.lockedWinnerId = user.id;

              io.to(contest.room.code).emit("blitz-problem-locked", {
                lockedProblemId: targetProblem.id,
                winnerHandle: user.handle,
                winnerId: user.id,
                nextIndex: targetProblem.indexInContest + 1,
              });
            }
          }
        }
      }

      await processUserSubs(player1, p1Subs);
      await processUserSubs(player2, p2Subs);

      // Re-evaluate contest standings & check completion
      const updatedContest = await prisma.contest.findUnique({
        where: { id: contest.id },
        include: {
          problems: { orderBy: { indexInContest: "asc" } },
          participants: { include: { user: true } },
          submissions: { include: { user: true, problem: true } },
        },
      });

      const standings = calculateStandings(updatedContest, player1, player2);
      io.to(contest.room.code).emit("scoreboard-update", { standings });

      // Also emit updated problems list so clients can sync locked status
      io.to(contest.room.code).emit("problems-update", {
        problems: updatedContest.problems,
      });

      if (contest.mode === "BLITZ") {
        const allLocked = updatedContest.problems.every((p) => p.lockedWinnerId !== null);
        if (allLocked) {
          await finishContest(updatedContest);
        }
      } else if (contest.mode === "CLASSIC") {
        const p1AC = standings.host.acceptedCount; // player1
        const p2AC = standings.guest.acceptedCount; // player2
        const total = updatedContest.problems.length;
        if (p1AC === total && p2AC === total) {
          await finishContest(updatedContest);
        }
      }
    } catch (err) {
      console.error(`Poll error for contest ${contestId}:`, err);
    }
  }

  // Standings calculator (host = player1, guest = player2)
  function calculateStandings(contest, p1, p2) {
    const subs = contest.submissions || [];
    const problems = contest.problems || [];

    function getPlayerStats(userId) {
      if (!userId) return { userId: null, acceptedCount: 0, penaltyMinutes: 0, lockedWon: 0, wrongSubsBeforeAC: 0, lastACTime: 0 };
      let acceptedCount = 0;
      let penaltyMinutes = 0;
      let lockedWon = 0;
      let wrongSubsBeforeAC = 0;
      let lastACTime = 0;

      for (const prob of problems) {
        const userProbSubs = subs
          .filter((s) => s.userId === userId && s.problemId === prob.id)
          .sort((a, b) => new Date(a.timeSubmitted) - new Date(b.timeSubmitted));

        const acSub = userProbSubs.find((s) => s.verdict === "OK");

        if (acSub) {
          acceptedCount++;
          if ((acSub.solveTimeSeconds || 0) > lastACTime) {
            lastACTime = acSub.solveTimeSeconds || 0;
          }

          const wrongBefore = userProbSubs.filter(
            (s) => new Date(s.timeSubmitted) < new Date(acSub.timeSubmitted) && s.verdict !== "OK"
          ).length;

          wrongSubsBeforeAC += wrongBefore;
          const solveTimeMin = Math.floor((acSub.solveTimeSeconds || 0) / 60);
          penaltyMinutes += solveTimeMin + wrongBefore * 20;
        }

        // BLITZ: count problems locked by this player
        if (contest.mode === "BLITZ" && prob.lockedWinnerId === userId) {
          lockedWon++;
        }
      }

      return {
        userId,
        acceptedCount,
        penaltyMinutes,
        lockedWon,
        wrongSubsBeforeAC,
        lastACTime,
      };
    }

    const p1Stats = getPlayerStats(p1?.id);
    const p2Stats = getPlayerStats(p2?.id);

    return {
      host: { ...p1Stats, user: p1 }, // contestant 1
      guest: { ...p2Stats, user: p2 }, // contestant 2
    };
  }

  // Finish Contest Helper
  async function finishContest(contest) {
    // Guard against double-finish
    const existing = await prisma.contest.findUnique({ where: { id: contest.id }, select: { status: true } });
    if (!existing || existing.status === "FINISHED") return;

    if (contestWatchers.has(contest.id)) {
      clearInterval(contestWatchers.get(contest.id));
      contestWatchers.delete(contest.id);
    }

    const player1 = contest.room.player1 || contest.room.host;
    const player2 = contest.room.player2 || contest.room.guest;
    if (!player1 || !player2) return;

    const standings = calculateStandings(contest, player1, player2);
    const p1S = standings.host;
    const p2S = standings.guest;

    let winnerId = null;

    if (contest.mode === "BLITZ") {
      if (p1S.lockedWon > p2S.lockedWon) winnerId = player1.id;
      else if (p2S.lockedWon > p1S.lockedWon) winnerId = player2.id;
      else {
        if (p1S.wrongSubsBeforeAC < p2S.wrongSubsBeforeAC) winnerId = player1.id;
        else if (p2S.wrongSubsBeforeAC < p1S.wrongSubsBeforeAC) winnerId = player2.id;
        else {
          if (p1S.lastACTime > 0 && p1S.lastACTime < p2S.lastACTime) winnerId = player1.id;
          else if (p2S.lastACTime > 0 && p2S.lastACTime < p1S.lastACTime) winnerId = player2.id;
        }
      }
    } else {
      // CLASSIC mode
      if (p1S.acceptedCount > p2S.acceptedCount) winnerId = player1.id;
      else if (p2S.acceptedCount > p1S.acceptedCount) winnerId = player2.id;
      else {
        if (p1S.penaltyMinutes < p2S.penaltyMinutes) winnerId = player1.id;
        else if (p2S.penaltyMinutes < p1S.penaltyMinutes) winnerId = player2.id;
        else {
          if (p1S.lastACTime > 0 && p1S.lastACTime < p2S.lastACTime) winnerId = player1.id;
          else if (p2S.lastACTime > 0 && p2S.lastACTime < p1S.lastACTime) winnerId = player2.id;
        }
      }
    }

    await prisma.contest.update({
      where: { id: contest.id },
      data: { status: "FINISHED", endTime: new Date() },
    });

    await prisma.room.update({
      where: { id: contest.room.id },
      data: { status: "FINISHED" },
    });

    const isDraw = winnerId === null;

    await prisma.participant.updateMany({
      where: { contestId: contest.id, userId: player1.id },
      data: {
        score: contest.mode === "BLITZ" ? p1S.lockedWon : p1S.acceptedCount,
        penalty: p1S.penaltyMinutes,
        acceptedCount: p1S.acceptedCount,
        isWinner: winnerId === player1.id,
      },
    });

    await prisma.participant.updateMany({
      where: { contestId: contest.id, userId: player2.id },
      data: {
        score: contest.mode === "BLITZ" ? p2S.lockedWon : p2S.acceptedCount,
        penalty: p2S.penaltyMinutes,
        acceptedCount: p2S.acceptedCount,
        isWinner: winnerId === player2.id,
      },
    });

    if (isDraw) {
      await prisma.user.update({ where: { id: player1.id }, data: { draws: { increment: 1 } } });
      await prisma.user.update({ where: { id: player2.id }, data: { draws: { increment: 1 } } });
    } else {
      const loserId = winnerId === player1.id ? player2.id : player1.id;
      await prisma.user.update({ where: { id: winnerId }, data: { wins: { increment: 1 } } });
      await prisma.user.update({ where: { id: loserId }, data: { losses: { increment: 1 } } });
    }

    const duration = Math.floor(
      (new Date().getTime() - new Date(contest.startTime).getTime()) / 1000
    );

    await prisma.matchHistory.create({
      data: {
        userId: player1.id,
        roomCode: contest.room.code,
        opponentHandle: player2.handle,
        mode: contest.mode,
        result: isDraw ? "DRAW" : winnerId === player1.id ? "WIN" : "LOSS",
        userScore: contest.mode === "BLITZ" ? p1S.lockedWon : p1S.acceptedCount,
        opponentScore: contest.mode === "BLITZ" ? p2S.lockedWon : p2S.acceptedCount,
        duration,
      },
    });

    await prisma.matchHistory.create({
      data: {
        userId: player2.id,
        roomCode: contest.room.code,
        opponentHandle: player1.handle,
        mode: contest.mode,
        result: isDraw ? "DRAW" : winnerId === player2.id ? "WIN" : "LOSS",
        userScore: contest.mode === "BLITZ" ? p2S.lockedWon : p2S.acceptedCount,
        opponentScore: contest.mode === "BLITZ" ? p1S.lockedWon : p1S.acceptedCount,
        duration,
      },
    });

    io.to(contest.room.code).emit("contest-finished", {
      winnerId,
      isDraw,
      winnerHandle: winnerId === player1.id ? player1.handle : winnerId === player2.id ? player2.handle : null,
      standings,
    });
  }

  // Socket Connection Handlers
  io.on("connection", (socket) => {
    socket.on("join-room", ({ roomCode, handle, userId }) => {
      socket.join(roomCode);

      if (!activeRooms.has(roomCode)) {
        activeRooms.set(roomCode, new Map());
      }
      const roomMap = activeRooms.get(roomCode);
      roomMap.set(socket.id, { handle, userId });

      const players = Array.from(roomMap.values());
      io.to(roomCode).emit("room-users-update", { players });
    });

    socket.on("leave-room", ({ roomCode, handle, userId }) => {
      socket.leave(roomCode);

      if (activeRooms.has(roomCode)) {
        const roomMap = activeRooms.get(roomCode);
        roomMap.delete(socket.id);
        const players = Array.from(roomMap.values());
        io.to(roomCode).emit("room-users-update", { players });
      }

      io.to(roomCode).emit("new-recent-action", {
        type: "LEAVE",
        action: {
          text: `🚪 ${handle || "A user"} has left the contest room.`,
          userId,
          timeSubmitted: new Date().toISOString(),
        },
      });
    });

    socket.on("start-contest", async ({ roomCode, userId }) => {
      try {
        const room = await prisma.room.findUnique({
          where: { code: roomCode },
          include: { contest: true },
        });

        if (!room || !room.contest || room.hostId !== userId) return;
        if (room.status === "IN_PROGRESS" || room.status === "FINISHED") return;

        const startTime = new Date();
        const durationMs = room.contest.durationMinutes * 60 * 1000;
        const endTime = new Date(startTime.getTime() + durationMs);

        await prisma.room.update({
          where: { id: room.id },
          data: { status: "IN_PROGRESS" },
        });

        await prisma.contest.update({
          where: { id: room.contest.id },
          data: {
            status: "IN_PROGRESS",
            startTime,
            endTime,
          },
        });

        io.to(roomCode).emit("contest-started", {
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          durationMinutes: room.contest.durationMinutes,
        });

        if (!contestWatchers.has(room.contest.id)) {
          pollContestSubmissions(room.contest.id);
          const watcher = setInterval(() => pollContestSubmissions(room.contest.id), 5000);
          contestWatchers.set(room.contest.id, watcher);
        }
      } catch (err) {
        console.error("Error starting contest via socket:", err);
      }
    });

    socket.on("disconnecting", () => {
      for (const roomCode of socket.rooms) {
        if (activeRooms.has(roomCode)) {
          const roomMap = activeRooms.get(roomCode);
          roomMap.delete(socket.id);
          const players = Array.from(roomMap.values());
          io.to(roomCode).emit("room-users-update", { players });
        }
      }
    });
  });

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
