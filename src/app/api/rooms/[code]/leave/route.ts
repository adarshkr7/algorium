import { prisma } from "@/lib/prisma";
import {
  apiError,
  apiSuccess,
  handleUnexpected,
  isErrorResponse,
  requireAuth,
} from "@/lib/api-utils";
import { finishContest } from "@/lib/services/contest-finalizer";
import { BroadcastService } from "@/lib/services/broadcast";

/**
 * POST /api/rooms/[code]/leave
 *
 * Before the contest starts, leaving cancels the room for everyone.
 * Once it's running, leaving is a resignation: the contest is finalised, the
 * opponent is awarded the win, and everyone still in the arena is notified.
 *
 * The notification is the important fix here — this route used to assume
 * `finishContest` broadcast the result and `finishContest` assumed the caller
 * did, so the opponent's screen simply never updated.
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
    const userId = session.userId;

    const room = await prisma.room.findUnique({
      where: { code },
      include: { contest: { select: { id: true, isSolo: true } } },
    });
    if (!room) {
      return apiError("Room not found", 404, { code: "ROOM_NOT_FOUND" });
    }

    const isMember =
      room.hostId === userId ||
      room.guestId === userId ||
      room.player1Id === userId ||
      room.player2Id === userId;
    if (!isMember) {
      return apiError("You are not in this room", 403, { code: "NOT_A_MEMBER" });
    }

    if (room.status === "FINISHED" || room.status === "CANCELLED") {
      return apiSuccess({ success: true, outcome: "already_closed" });
    }

    // ── Mid-contest: resignation ───────────────────────────────────────────
    if (room.status === "IN_PROGRESS" && room.contest) {
      const participant = await prisma.participant.findUnique({
        where: { contestId_userId: { contestId: room.contest.id, userId } },
        select: { id: true, hasResigned: true },
      });

      // Supervisors aren't contestants; they just stop watching.
      if (!participant) {
        return apiSuccess({ success: true, outcome: "left_as_spectator" });
      }

      if (!participant.hasResigned) {
        await prisma.participant.update({
          where: { id: participant.id },
          data: { hasResigned: true },
        });

        // finishContest broadcasts contest-finished itself.
        await finishContest(room.contest.id, {
          reason: "resignation",
          resignedUserId: userId,
        });
      }

      return apiSuccess({ success: true, outcome: "resigned" });
    }

    const leaver = await prisma.user.findUnique({
      where: { id: userId },
      select: { handle: true },
    });

    // ── Pre-contest: a guest vacates, the host cancels ─────────────────────
    //
    // Leaving used to cancel the room whoever did it, which meant anyone who
    // joined a public duel could destroy the host's room on the way out — one
    // click, and the host is back to square one. Only the person who owns the
    // room gets to close it; everyone else just gives their seat back.
    if (room.hostId !== userId) {
      await prisma.$transaction(async (tx) => {
        await tx.room.update({
          where: { id: room.id },
          data: {
            // A player-hosted room seats the guest in both `guest` and
            // `player2`, so clear whichever seats this user actually holds.
            guestId: room.guestId === userId ? null : undefined,
            player1Id: room.player1Id === userId ? null : undefined,
            player2Id: room.player2Id === userId ? null : undefined,
          },
        });

        if (room.contest) {
          // Drops their media state with them, so a proctored room does not
          // keep waiting on a camera that left.
          await tx.participant.deleteMany({
            where: { contestId: room.contest.id, userId },
          });
        }

        // Joining a best-of room also seats you in the series. Give that back
        // too, but only while the series is still scoreless — once a game has
        // been played the opponent is a matter of record.
        if (room.seriesId) {
          await tx.matchSeries.updateMany({
            where: {
              id: room.seriesId,
              player2Id: userId,
              player1Wins: 0,
              player2Wins: 0,
              draws: 0,
            },
            data: { player2Id: null },
          });
        }
      });

      // The lobby polls every few seconds, so the host sees the seat free up
      // without a dedicated event.
      return apiSuccess({ success: true, outcome: "left" });
    }

    await prisma.$transaction([
      prisma.room.update({
        where: { id: room.id },
        data: { status: "CANCELLED" },
      }),
      ...(room.contest
        ? [
            prisma.contest.update({
              where: { id: room.contest.id },
              data: { status: "CANCELLED" },
            }),
          ]
        : []),
    ]);

    await new BroadcastService(code).broadcastRoomCancelled(
      leaver?.handle ?? "A player",
    );

    return apiSuccess({ success: true, outcome: "cancelled" });
  } catch (error) {
    return handleUnexpected("rooms/[code]/leave", error, req);
  }
}
