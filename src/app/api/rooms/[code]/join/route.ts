import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateContest } from "@/lib/contest-generator";
import { fetchCFUserSolvedKeys } from "@/lib/codeforces";
import { requireAuth, isErrorResponse, apiError, apiSuccess } from "@/lib/api-utils";
import { ParticipantRole } from "@prisma/client";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const sessionOrError = await requireAuth(req);
    if (isErrorResponse(sessionOrError)) return sessionOrError;
    const session = sessionOrError;

    const { code } = await params;
    const { guestId } = await req.json(); // guestId refers to joining userId

    if (!code || !guestId) {
      return apiError("Room code and guestId are required", 400);
    }

    if (session.userId !== guestId) {
      return apiError("Unauthorized: guestId does not match session", 403);
    }

    const uppercaseCode = code.toUpperCase();
    const room = await prisma.room.findUnique({
      where: { code: uppercaseCode },
      include: {
        host: true,
        guest: true,
        player1: true,
        player2: true,
        contest: {
          include: {
            problems: { orderBy: { indexInContest: "asc" } },
          },
        },
      },
    });

    if (!room) {
      return apiError("Room not found", 404);
    }

    const isSupervised = room.hostingType === "SUPERVISED";
    const joiningUser = await prisma.user.findUnique({ where: { id: guestId } });
    if (!joiningUser) {
      return apiError("User not found", 404);
    }

    const activeRoom = await prisma.room.findFirst({
      where: {
        OR: [
          { hostId: guestId },
          { guestId: guestId },
          { player1Id: guestId },
          { player2Id: guestId },
        ],
        status: { in: ["WAITING", "IN_PROGRESS"] },
        NOT: {
          contest: {
            participants: {
              some: {
                userId: guestId,
                hasResigned: true,
              },
            },
          },
        },
      },
    });

    if (activeRoom && activeRoom.code !== uppercaseCode) {
      return apiError("You are already in another active room. Please leave it first.", 400);
    }

    let updateData: any = {};
    let assignedRole: ParticipantRole = "GUEST";
    let whereCondition: any = { id: room.id };

    if (!isSupervised) {
      // ── PLAYER HOST MODE (Host vs Guest) ──
      if (room.hostId === guestId) {
        return apiSuccess({ room });
      }

      if (room.guestId && room.guestId !== guestId) {
        return apiError("Room is already full", 400);
      }

      updateData = {
        guestId,
        player1Id: room.hostId,
        player2Id: guestId,
      };
      assignedRole = "GUEST";
      whereCondition.guestId = null; // Optimistic concurrency: ensure guest hasn't been set yet
    } else {
      // ── SUPERVISED MODE (Host supervises Player 1 vs Player 2) ──
      if (room.hostId === guestId) {
        return apiSuccess({ room });
      }

      if (room.player1Id === guestId || room.player2Id === guestId) {
        return apiSuccess({ room });
      }

      if (!room.player1Id) {
        updateData = { player1Id: guestId };
        assignedRole = "PLAYER_1";
        whereCondition.player1Id = null; // Optimistic concurrency
      } else if (!room.player2Id) {
        updateData = { player2Id: guestId, guestId };
        assignedRole = "PLAYER_2";
        whereCondition.player2Id = null; // Optimistic concurrency
      } else {
        return apiError("Room is already full with 2 contestants", 400);
      }
    }

    // Connect user to room using transaction to ensure atomicity
    let updatedRoom;
    try {
      updatedRoom = await prisma.$transaction(async (tx) => {
        const ur = await tx.room.update({
          where: whereCondition,
          data: updateData,
          include: {
            host: true,
            guest: true,
            player1: true,
            player2: true,
            contest: {
              include: {
                problems: { orderBy: { indexInContest: "asc" } },
                participants: { include: { user: true } },
              },
            },
          },
        });

        // Ensure Participant record exists
        if (ur.contest) {
          const existingParticipant = await tx.participant.findFirst({
            where: { contestId: ur.contest.id, userId: guestId },
          });

          if (!existingParticipant) {
            await tx.participant.create({
              data: {
                contestId: ur.contest.id,
                userId: guestId,
                role: assignedRole,
              },
            });
          }
        }
        return ur;
      });
    } catch (e: any) {
      if (e.code === "P2025") {
        return apiError("Room was filled by another user. Try another room.", 409);
      }
      throw e;
    }

    if (updatedRoom.contest) {
      // Re-verify that NEITHER contestant has solved any problem in the room!
      const p1User = updatedRoom.player1 || updatedRoom.host;
      const p2User = updatedRoom.player2 || updatedRoom.guest;

      if (p1User && p2User) {
        const [p1Solved, p2Solved] = await Promise.all([
          fetchCFUserSolvedKeys(p1User.handle),
          fetchCFUserSolvedKeys(p2User.handle),
        ]);

        const hasSolvedProblem = updatedRoom.contest.problems.some(
          (p) => p1Solved.has(p.problemKey) || p2Solved.has(p.problemKey)
        );

        if (hasSolvedProblem) {
          console.log(`Re-generating problems for room ${uppercaseCode} for competitors ${p1User.handle} & ${p2User.handle}`);
          await prisma.problem.deleteMany({
            where: { contestId: updatedRoom.contest.id },
          });

          const newProblems = await generateContest({
            name: updatedRoom.contest.name,
            mode: updatedRoom.contest.mode,
            problemCount: updatedRoom.contest.problemCount,
            durationMinutes: updatedRoom.contest.durationMinutes,
            minRating: updatedRoom.contest.minRating,
            maxRating: updatedRoom.contest.maxRating,
            allowedTags: updatedRoom.contest.allowedTags,
            excludedTags: updatedRoom.contest.excludedTags,
            seed: updatedRoom.contest.seed,
            hostHandle: p1User.handle,
            guestHandle: p2User.handle,
          });

          await prisma.problem.createMany({
            data: newProblems.map((p) => ({
              contestId: updatedRoom.contest!.id,
              problemKey: p.problemKey,
              name: p.name,
              rating: p.rating,
              tags: p.tags,
              indexInContest: p.indexInContest,
            })),
          });
        }
      }
    }

    // Refetch clean room data
    const finalRoom = await prisma.room.findUnique({
      where: { id: room.id },
      include: {
        host: true,
        guest: true,
        player1: true,
        player2: true,
        contest: {
          include: {
            problems: { orderBy: { indexInContest: "asc" } },
            participants: { include: { user: true } },
          },
        },
      },
    });

    return apiSuccess({ room: finalRoom });
  } catch (error) {
    console.error("Join room API error:", error);
    return apiError("Internal server error", 500);
  }
}
