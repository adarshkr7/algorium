import { prisma } from "@/lib/prisma";
import {
  apiError,
  apiSuccess,
  handleUnexpected,
  isErrorResponse,
  requireAuth,
} from "@/lib/api-utils";

/**
 * GET /api/rooms/[code]/media/events
 *
 * The compliance log for one contest, used by the results screen.
 *
 * Kept off the room payload deliberately: the arena polls that every few
 * seconds for a whole contest, and an append-only audit trail would grow the
 * response for the entire duration to serve one screen shown once at the end.
 */
const MAX_EVENTS = 500;

export async function GET(
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
      select: {
        hostId: true,
        guestId: true,
        player1Id: true,
        player2Id: true,
        contest: {
          select: { id: true, requireVideo: true, requireAudio: true },
        },
      },
    });
    if (!room?.contest) {
      return apiError("Room not found", 404, { code: "ROOM_NOT_FOUND" });
    }

    // The log says who had their camera off and when. That is nobody's
    // business but the people who were in the room.
    const isMember =
      room.hostId === session.userId ||
      room.guestId === session.userId ||
      room.player1Id === session.userId ||
      room.player2Id === session.userId;
    if (!isMember) {
      return apiError("You were not in this room", 403, {
        code: "NOT_A_MEMBER",
      });
    }

    const events = await prisma.mediaEvent.findMany({
      where: { contestId: room.contest.id },
      orderBy: { at: "asc" },
      take: MAX_EVENTS,
      select: { userId: true, kind: true, source: true, at: true },
    });

    return apiSuccess({
      events,
      policy: {
        requireVideo: room.contest.requireVideo,
        requireAudio: room.contest.requireAudio,
      },
    });
  } catch (error) {
    return handleUnexpected("rooms/[code]/media/events", error);
  }
}
