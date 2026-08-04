import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isErrorResponse, apiError, apiSuccess } from "@/lib/api-utils";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const sessionOrError = await requireAuth(req);
    if (isErrorResponse(sessionOrError)) return sessionOrError;
    const session = sessionOrError;

    const { code } = await params;
    const { userId } = await req.json();

    if (!code || !userId) {
      return apiError("Code and userId are required", 400);
    }

    if (session.userId !== userId) {
      return apiError("Unauthorized: userId does not match session", 403);
    }

    const uppercaseCode = code.toUpperCase();
    const room = await prisma.room.findUnique({
      where: { code: uppercaseCode },
      include: { contest: true },
    });

    if (!room || !room.contest) {
      return apiError("Room or contest not found", 404);
    }

    if (room.hostId !== userId) {
      return apiError("Only the host can start the contest", 403);
    }

    if (!room.player2Id) {
      return apiError("Cannot start contest until two players have joined", 400);
    }

    if (room.status === "IN_PROGRESS" || room.status === "FINISHED") {
      return apiSuccess({ room });
    }

    const startTime = new Date();
    const durationMs = room.contest.durationMinutes * 60 * 1000;
    const endTime = new Date(startTime.getTime() + durationMs);

    const updatedRoom = await prisma.room.update({
      where: { id: room.id },
      data: {
        status: "IN_PROGRESS",
        contest: {
          update: {
            status: "IN_PROGRESS",
            startTime,
            endTime,
          },
        },
      },
      include: {
        host: true,
        guest: true,
        player1: true,
        player2: true,
        contest: true,
      },
    });

    return apiSuccess({ room: updatedRoom });
  } catch (error: any) {
    console.error("Start contest API error:", error);
    return apiError("Internal server error", 500);
  }
}
