import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateContest } from "@/lib/contest-generator";
import { fetchCFUserSolvedKeys } from "@/lib/codeforces";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const { guestId } = await req.json(); // guestId refers to joining userId

    if (!code || !guestId) {
      return NextResponse.json({ error: "Room code and guestId are required" }, { status: 400 });
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
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const isSupervised = room.hostingType === "SUPERVISED";
    const joiningUser = await prisma.user.findUnique({ where: { id: guestId } });
    if (!joiningUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
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
      return NextResponse.json(
        { error: "You are already in another active room. Please leave it first." },
        { status: 400 }
      );
    }

    let updateData: any = {};
    let assignedRole: string = "GUEST";

    if (!isSupervised) {
      // ── PLAYER HOST MODE (Host vs Guest) ──
      if (room.hostId === guestId) {
        return NextResponse.json({ room });
      }

      if (room.guestId && room.guestId !== guestId) {
        return NextResponse.json({ error: "Room is already full" }, { status: 400 });
      }

      updateData = {
        guestId,
        player1Id: room.hostId,
        player2Id: guestId,
      };
      assignedRole = "GUEST";
    } else {
      // ── SUPERVISED MODE (Host supervises Player 1 vs Player 2) ──
      if (room.hostId === guestId) {
        // Supervisor accessing room
        return NextResponse.json({ room });
      }

      if (room.player1Id === guestId || room.player2Id === guestId) {
        // Player already assigned
        return NextResponse.json({ room });
      }

      if (!room.player1Id) {
        // First contestant to join
        updateData = { player1Id: guestId };
        assignedRole = "PLAYER_1";
      } else if (!room.player2Id) {
        // Second contestant to join
        updateData = { player2Id: guestId, guestId };
        assignedRole = "PLAYER_2";
      } else {
        return NextResponse.json({ error: "Room is already full with 2 contestants" }, { status: 400 });
      }
    }

    // Connect user to room
    const updatedRoom = await prisma.room.update({
      where: { id: room.id },
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
    if (updatedRoom.contest) {
      const existingParticipant = await prisma.participant.findFirst({
        where: {
          contestId: updatedRoom.contest.id,
          userId: guestId,
        },
      });

      if (!existingParticipant) {
        await prisma.participant.create({
          data: {
            contestId: updatedRoom.contest.id,
            userId: guestId,
            role: assignedRole,
          },
        });
      }

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
            mode: updatedRoom.contest.mode as "BLITZ" | "CLASSIC",
            problemCount: updatedRoom.contest.problemCount,
            durationMinutes: updatedRoom.contest.durationMinutes,
            minRating: updatedRoom.contest.minRating,
            maxRating: updatedRoom.contest.maxRating,
            allowedTags: JSON.parse(updatedRoom.contest.allowedTags || "[]"),
            excludedTags: JSON.parse(updatedRoom.contest.excludedTags || "[]"),
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
              tags: JSON.stringify(p.tags),
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

    return NextResponse.json({ room: finalRoom });
  } catch (error) {
    console.error("Join room API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
