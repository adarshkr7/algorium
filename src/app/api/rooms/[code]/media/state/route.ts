import { prisma } from "@/lib/prisma";
import {
  apiError,
  apiSuccess,
  enforceRateLimit,
  handleUnexpected,
  isErrorResponse,
  parseBody,
  requireAuth,
} from "@/lib/api-utils";
import { MediaStateSchema } from "@/lib/validation";
import {
  missingDevices,
  recordMediaState,
} from "@/lib/services/media-policy";

/**
 * POST /api/rooms/[code]/media/state
 *
 * A participant reporting whether their own camera and microphone are live.
 * This is what the lobby's start guard and the enforcement sweep read, so it
 * is written server-side rather than trusted from presence alone.
 *
 * Self-reported, and therefore only as honest as the client. The media
 * provider's own view of published tracks supersedes it once that lands.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    // Devices flap (a laptop lid, a reconnect), so this is chattier than most
    // routes — but not unboundedly so.
    const limited = await enforceRateLimit(req, 60, 60_000);
    if (limited) return limited;

    const session = await requireAuth(req);
    if (isErrorResponse(session)) return session;

    const { code: rawCode } = await params;
    if (!rawCode || rawCode.length !== 6) {
      return apiError("Invalid room code", 400, { code: "INVALID_CODE" });
    }
    const code = rawCode.toUpperCase();

    const body = await parseBody(req, MediaStateSchema);
    if (isErrorResponse(body)) return body;

    const room = await prisma.room.findUnique({
      where: { code },
      select: {
        contest: {
          select: {
            id: true,
            status: true,
            requireVideo: true,
            requireAudio: true,
          },
        },
      },
    });
    if (!room?.contest) {
      return apiError("Room not found", 404, { code: "ROOM_NOT_FOUND" });
    }
    const contest = room.contest;

    const participant = await prisma.participant.findUnique({
      where: {
        contestId_userId: { contestId: contest.id, userId: session.userId },
      },
      select: {
        role: true,
        videoOn: true,
        audioOn: true,
        mediaJoinedAt: true,
        violationSince: true,
      },
    });
    if (!participant) {
      return apiError("You're not in this room", 403, {
        code: "NOT_A_PARTICIPANT",
      });
    }

    const { compliant } = await recordMediaState({
      contestId: contest.id,
      contestStatus: contest.status,
      policy: contest,
      userId: session.userId,
      role: participant.role,
      previous: participant,
      next: { videoOn: body.videoOn, audioOn: body.audioOn },
      source: "client",
    });

    return apiSuccess({
      compliant,
      missing: missingDevices(contest, body),
      policy: {
        requireVideo: contest.requireVideo,
        requireAudio: contest.requireAudio,
      },
    });
  } catch (error) {
    return handleUnexpected("rooms/[code]/media/state", error);
  }
}
