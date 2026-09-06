import { prisma } from "@/lib/prisma";
import { apiSuccess, handleUnexpected } from "@/lib/api-utils";
import { ROOM_SUMMARY_INCLUDE } from "@/lib/services/room-service";

export const dynamic = "force-dynamic";

/** Open rooms older than this are almost certainly abandoned. */
const MAX_AGE_MS = 2 * 60 * 60 * 1000;
const LIMIT = 20;

/**
 * GET /api/rooms/public — the open-duels lobby.
 *
 * Lists rooms whose host ticked "public" and which still have a free slot,
 * so players can join without swapping codes.
 */
export async function GET(req: Request) {
  try {
    const rooms = await prisma.room.findMany({
      where: {
        isPublic: true,
        status: "WAITING",
        createdAt: { gte: new Date(Date.now() - MAX_AGE_MS) },
        // Free slot: player-hosted rooms need a guest, supervised need a P2.
        OR: [
          { hostingType: "PLAYER_HOST", guestId: null },
          { hostingType: "SUPERVISED", player2Id: null },
        ],
      },
      include: ROOM_SUMMARY_INCLUDE,
      orderBy: { createdAt: "desc" },
      take: LIMIT,
    });

    return apiSuccess({ rooms, count: rooms.length });
  } catch (error) {
    return handleUnexpected("rooms/public", error, req);
  }
}
