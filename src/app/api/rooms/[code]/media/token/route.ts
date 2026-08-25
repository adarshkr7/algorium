import { prisma } from "@/lib/prisma";
import {
  apiError,
  apiSuccess,
  enforceRateLimit,
  handleUnexpected,
  isErrorResponse,
  requireAuth,
} from "@/lib/api-utils";
import {
  getLiveKitConfig,
  mediaRoomName,
  mintJoinToken,
} from "@/lib/livekit";
import { isContestant, mediaRequired } from "@/lib/services/media-policy";

/**
 * POST /api/rooms/[code]/media/token
 *
 * Mints a LiveKit join token for one participant of one room.
 *
 * This is the authorisation boundary for the call. Room codes are six
 * characters and get shared around; without this check anyone holding one
 * could sit in a duel's video call. Membership is resolved from the session
 * against the Room row, never from the request.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const limited = enforceRateLimit(req, 20, 60_000);
    if (limited) return limited;

    const session = await requireAuth(req);
    if (isErrorResponse(session)) return session;

    const { code: rawCode } = await params;
    if (!rawCode || rawCode.length !== 6) {
      return apiError("Invalid room code", 400, { code: "INVALID_CODE" });
    }
    const code = rawCode.toUpperCase();

    const config = getLiveKitConfig();
    if (!config) {
      // Not an error the user can act on — the arena falls back to a local
      // preview and says so, rather than showing a broken call.
      return apiSuccess({ configured: false, token: null, url: null });
    }

    const room = await prisma.room.findUnique({
      where: { code },
      select: {
        status: true,
        contest: {
          select: {
            id: true,
            requireVideo: true,
            requireAudio: true,
          },
        },
      },
    });
    if (!room?.contest) {
      return apiError("Room not found", 404, { code: "ROOM_NOT_FOUND" });
    }
    if (room.status === "CANCELLED" || room.status === "FINISHED") {
      return apiError("This room is closed", 410, { code: "ROOM_CLOSED" });
    }
    if (!mediaRequired(room.contest)) {
      return apiSuccess({ configured: false, token: null, url: null });
    }

    const participant = await prisma.participant.findUnique({
      where: {
        contestId_userId: { contestId: room.contest.id, userId: session.userId },
      },
      select: { role: true, user: { select: { handle: true } } },
    });
    if (!participant) {
      return apiError("You're not in this room", 403, {
        code: "NOT_A_PARTICIPANT",
      });
    }

    const token = await mintJoinToken({
      config,
      roomCode: code,
      userId: session.userId,
      handle: participant.user.handle,
      role: participant.role,
      // Supervisors watch. Letting them publish would put a third tile in a
      // duel that is meant to be two people.
      canPublish: isContestant(participant.role),
    });

    return apiSuccess({
      configured: true,
      token,
      url: process.env.NEXT_PUBLIC_LIVEKIT_URL ?? config.url,
      room: mediaRoomName(code),
      identity: session.userId,
      canPublish: isContestant(participant.role),
    });
  } catch (error) {
    return handleUnexpected("rooms/[code]/media/token", error);
  }
}
