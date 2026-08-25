import { prisma } from "@/lib/prisma";
import {
  apiError,
  apiSuccess,
  handleUnexpected,
  isErrorResponse,
  requireAuth,
} from "@/lib/api-utils";
import { ROOM_INCLUDE } from "@/lib/services/room-service";
import { BroadcastService } from "@/lib/services/broadcast";
import {
  describeRequirement,
  isCompliant,
  mediaRequired,
} from "@/lib/services/media-policy";

/**
 * POST /api/rooms/[code]/start — host only.
 *
 * Also broadcasts `contest-started`, so a guest whose lobby tab is open is
 * moved into the arena without waiting for the 5s poll.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const session = await requireAuth(req);
    if (isErrorResponse(session)) return session;

    const { code: rawCode } = await params;
    if (!rawCode || rawCode.length !== 6) {
      return apiError("Invalid room code", 400, { code: "INVALID_CODE" });
    }
    const code = rawCode.toUpperCase();

    const room = await prisma.room.findUnique({
      where: { code },
      include: {
        contest: {
          select: {
            id: true,
            durationMinutes: true,
            isSolo: true,
            requireVideo: true,
            requireAudio: true,
          },
        },
      },
    });

    if (!room || !room.contest) {
      return apiError("Room not found", 404, { code: "ROOM_NOT_FOUND" });
    }
    if (room.hostId !== session.userId) {
      return apiError("Only the host can start this contest", 403, {
        code: "NOT_HOST",
      });
    }
    if (room.status === "CANCELLED") {
      return apiError("This room was cancelled", 410, { code: "ROOM_CANCELLED" });
    }

    // Idempotent: a double-click just returns the running room.
    if (room.status === "IN_PROGRESS" || room.status === "FINISHED") {
      const current = await prisma.room.findUnique({
        where: { id: room.id },
        include: ROOM_INCLUDE,
      });
      return apiSuccess({ room: current, alreadyStarted: true });
    }

    // Solo practice needs no opponent.
    if (!room.contest.isSolo && !room.player2Id) {
      return apiError(
        room.hostingType === "SUPERVISED"
          ? "Both players must join before you can start"
          : "Waiting for an opponent to join",
        409,
        { code: "NOT_ENOUGH_PLAYERS" },
      );
    }

    // ── Camera / microphone gate ───────────────────────────────────────────
    // The lobby disables the button, but that is a courtesy: the check has to
    // happen here or a crafted POST starts a proctored contest with the
    // cameras off.
    if (mediaRequired(room.contest)) {
      const participants = await prisma.participant.findMany({
        where: { contestId: room.contest.id },
        select: {
          role: true,
          videoOn: true,
          audioOn: true,
          user: { select: { handle: true } },
        },
      });

      const notReady = participants.filter(
        (p) => !isCompliant(room.contest!, p),
      );

      if (notReady.length > 0) {
        const handles = notReady.map((p) => p.user.handle).join(" and ");
        return apiError(
          `${handles} still needs to turn their ${describeRequirement(room.contest)} on`,
          409,
          {
            code: "MEDIA_NOT_READY",
            details: { handles: notReady.map((p) => p.user.handle) },
          },
        );
      }
    }

    const problemCount = await prisma.problem.count({
      where: { contestId: room.contest.id },
    });
    if (problemCount === 0) {
      return apiError("This contest has no problems", 422, {
        code: "NO_PROBLEMS",
      });
    }

    const startTime = new Date();
    const endTime = new Date(
      startTime.getTime() + room.contest.durationMinutes * 60 * 1000,
    );

    // Guard on WAITING so two hosts' tabs can't both start it.
    const claimed = await prisma.room.updateMany({
      where: { id: room.id, status: "WAITING" },
      data: { status: "IN_PROGRESS" },
    });
    if (claimed.count === 0) {
      const current = await prisma.room.findUnique({
        where: { id: room.id },
        include: ROOM_INCLUDE,
      });
      return apiSuccess({ room: current, alreadyStarted: true });
    }

    await prisma.contest.update({
      where: { id: room.contest.id },
      data: { status: "IN_PROGRESS", startTime, endTime },
    });

    const updatedRoom = await prisma.room.findUnique({
      where: { id: room.id },
      include: ROOM_INCLUDE,
    });

    await new BroadcastService(code).broadcastContestStarted(
      startTime.toISOString(),
    );

    return apiSuccess({ room: updatedRoom, alreadyStarted: false });
  } catch (error) {
    return handleUnexpected("rooms/[code]/start", error);
  }
}
