import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isErrorResponse, apiError, apiSuccess } from "@/lib/api-utils";

export async function GET(req: Request) {
  try {
    const sessionOrError = await requireAuth(req);
    if (isErrorResponse(sessionOrError)) return sessionOrError;
    const session = sessionOrError;
    const userId = session.userId;

    const activeRoom = await prisma.room.findFirst({
      where: {
        OR: [
          { hostId: userId },
          { guestId: userId },
          { player1Id: userId },
          { player2Id: userId },
        ],
        status: { in: ["WAITING", "IN_PROGRESS"] },
        NOT: {
          contest: {
            participants: {
              some: {
                userId: userId,
                hasResigned: true,
              },
            },
          },
        },
      },
      include: {
        contest: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!activeRoom) {
      return apiSuccess({ room: null });
    }

    return apiSuccess({ room: activeRoom });
  } catch (error: any) {
    return apiError("Internal server error", 500);
  }
}
