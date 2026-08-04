import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isErrorResponse, apiError, apiSuccess } from "@/lib/api-utils";
import { finishContest } from "@/lib/services/contest-finalizer";
import { BroadcastService } from "@/lib/services/broadcast";

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
      return apiError("Room code and userId are required", 400);
    }

    if (session.userId !== userId) {
      return apiError("Unauthorized: userId does not match session", 403);
    }

    const uppercaseCode = code.toUpperCase();
    const room = await prisma.room.findUnique({
      where: { code: uppercaseCode },
      include: { contest: true },
    });

    if (!room) {
      return apiError("Room not found", 404);
    }

    const broadcaster = new BroadcastService(uppercaseCode);

    if (room.status === "IN_PROGRESS" && room.contest) {
      // Mark the participant as resigned
      const participant = await prisma.participant.findFirst({
        where: { contestId: room.contest.id, userId },
      });

      if (participant && !participant.hasResigned) {
        await prisma.participant.update({
          where: { id: participant.id },
          data: { hasResigned: true },
        });

        // Trigger finishContest to properly handle winner determination and DB writes
        const finishResult = await finishContest(room.contest.id);

        if (finishResult) {
          // If finishContest ran successfully, it will have broadcast the 'contest-finished' event
          // But we can optionally add a specific resignation broadcast here if needed,
          // though finishContest broadcast is generally enough.
        }
      }
    } else {
      // Room hasn't started yet, or finished. Anyone leaving cancels the room for everyone.
      await prisma.room.update({
        where: { id: room.id },
        data: { status: "CANCELLED" },
      });
      if (room.contest) {
        await prisma.contest.update({
          where: { id: room.contest.id },
          data: { status: "CANCELLED" },
        });
      }

      const leaver = await prisma.user.findUnique({ where: { id: userId } });
      const channel = broadcaster["supabase"].channel(`room-${uppercaseCode}`); // access private field directly for this specific broadcast
      await channel.send({
        type: 'broadcast',
        event: 'room-cancelled',
        payload: { by: leaver?.handle || 'A user' }
      });
    }

    return apiSuccess({ success: true });
  } catch (error) {
    console.error("Leave room API error:", error);
    return apiError("Internal server error", 500);
  }
}
