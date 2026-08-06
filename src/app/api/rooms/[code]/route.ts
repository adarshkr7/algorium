import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess, handleUnexpected } from "@/lib/api-utils";
import { ROOM_INCLUDE } from "@/lib/services/room-service";

export const dynamic = "force-dynamic";

/** GET /api/rooms/[code] — full room state for the lobby and arena. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
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

    // apiSuccess serialises BigInt (Submission.cfSubmissionId) safely.
    return apiSuccess({ room });
  } catch (error) {
    return handleUnexpected("rooms/[code]", error);
  }
}
