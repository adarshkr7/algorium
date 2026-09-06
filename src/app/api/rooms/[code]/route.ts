import { prisma } from "@/lib/prisma";
import {
  apiError,
  apiSuccess,
  enforceRateLimit,
  handleUnexpected,
  isErrorResponse,
  requireAuth,
} from "@/lib/api-utils";
import { ROOM_INCLUDE, isRoomMember } from "@/lib/services/room-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/rooms/[code] — full room state for the lobby and arena.
 *
 * Authenticated. Room codes are six characters, so an open endpoint here let
 * anyone walk the whole space and read back every room's contents; the public
 * lobby (`/api/rooms/public`) is the intended way to discover a room without a
 * code, and it returns a deliberately narrow summary.
 *
 * Non-members still get the room — an invite link has to render before you can
 * join through it — but not the submission feed, which is the two contestants'
 * verdict history and none of a bystander's business.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const limited = await enforceRateLimit(req, 120, 60_000);
    if (limited) return limited;

    const session = await requireAuth(req);
    if (isErrorResponse(session)) return session;

    const { code } = await params;
    if (!code || code.length !== 6) {
      return apiError("Invalid room code", 400, { code: "INVALID_CODE" });
    }

    const room = await prisma.room.findUnique({
      where: { code: code.toUpperCase() },
      include: ROOM_INCLUDE,
    });

    if (!room) {
      return apiError("Room not found", 404, { code: "ROOM_NOT_FOUND" });
    }

    if (!isRoomMember(room, session.userId) && room.contest) {
      return apiSuccess({
        room: { ...room, contest: { ...room.contest, submissions: [] } },
      });
    }

    // apiSuccess serialises BigInt (Submission.cfSubmissionId) safely.
    return apiSuccess({ room });
  } catch (error) {
    return handleUnexpected("rooms/[code]", error);
  }
}
