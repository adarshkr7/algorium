import { ParticipantRole, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateContest } from "@/lib/contest-generator";
import { fetchCFUserSolvedKeys } from "@/lib/codeforces";
import {
  apiError,
  apiSuccess,
  enforceRateLimit,
  handleUnexpected,
  isErrorResponse,
  requireAuth,
} from "@/lib/api-utils";
import {
  ROOM_INCLUDE,
  findActiveRoomForUser,
} from "@/lib/services/room-service";
import { BroadcastService } from "@/lib/services/broadcast";

/**
 * POST /api/rooms/[code]/join
 *
 * The joining user is taken from the session; the body is ignored. Assignment
 * uses a conditional update (`where: { player2Id: null }`) so two people
 * racing for the last slot cannot both win it.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const limited = enforceRateLimit(req, 30, 60_000);
    if (limited) return limited;

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
      include: ROOM_INCLUDE,
    });
    if (!room) {
      return apiError("Room not found", 404, { code: "ROOM_NOT_FOUND" });
    }
    if (room.status === "CANCELLED") {
      return apiError("This room was cancelled", 410, { code: "ROOM_CANCELLED" });
    }
    if (room.status === "FINISHED") {
      return apiError("This contest has already finished", 410, {
        code: "ROOM_FINISHED",
      });
    }

    const joiningUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, handle: true },
    });
    if (!joiningUser) return apiError("Your account no longer exists", 404);

    const alreadyInRoom =
      room.hostId === userId ||
      room.guestId === userId ||
      room.player1Id === userId ||
      room.player2Id === userId;

    // Already a member — just hand back the current state.
    if (alreadyInRoom) {
      return apiSuccess({ room, joined: false });
    }

    if (room.contest?.isSolo) {
      return apiError("This is a solo practice room", 403, {
        code: "SOLO_ROOM",
      });
    }

    const otherRoom = await findActiveRoomForUser(userId);
    if (otherRoom && otherRoom.code !== code) {
      return apiError(
        `You're already in room ${otherRoom.code}. Leave it before joining another.`,
        409,
        { code: "ALREADY_IN_ROOM", details: { code: otherRoom.code } },
      );
    }

    // ── Work out the slot ────────────────────────────────────────────────
    const isSupervised = room.hostingType === "SUPERVISED";
    let data: Prisma.RoomUpdateInput;
    let where: Prisma.RoomWhereUniqueInput;
    let role: ParticipantRole;

    if (!isSupervised) {
      if (room.guestId) {
        return apiError("This room is already full", 409, { code: "ROOM_FULL" });
      }
      where = { id: room.id, guestId: null };
      data = {
        guest: { connect: { id: userId } },
        player1: { connect: { id: room.hostId } },
        player2: { connect: { id: userId } },
      };
      role = ParticipantRole.GUEST;
    } else if (!room.player1Id) {
      where = { id: room.id, player1Id: null };
      data = { player1: { connect: { id: userId } } };
      role = ParticipantRole.PLAYER_1;
    } else if (!room.player2Id) {
      where = { id: room.id, player2Id: null };
      data = {
        player2: { connect: { id: userId } },
        guest: { connect: { id: userId } },
      };
      role = ParticipantRole.PLAYER_2;
    } else {
      return apiError("This room already has two contestants", 409, {
        code: "ROOM_FULL",
      });
    }

    try {
      await prisma.$transaction(async (tx) => {
        const updated = await tx.room.update({ where, data });

        if (room.contest) {
          // The unique constraint on (contestId, userId) makes this safe to
          // run concurrently — the old findFirst/create pair was not.
          await tx.participant.upsert({
            where: {
              contestId_userId: { contestId: room.contest.id, userId },
            },
            create: { contestId: room.contest.id, userId, role },
            update: {},
          });
        }

        // Fill in the opponent on a pending best-of series.
        if (updated.seriesId && !isSupervised) {
          await tx.matchSeries.updateMany({
            where: { id: updated.seriesId, player2Id: null },
            data: { player2Id: userId },
          });
        }
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        return apiError("Someone else took the last slot", 409, {
          code: "ROOM_FULL",
        });
      }
      throw error;
    }

    // ── Re-verify the problem set against both histories ─────────────────
    const withPlayers = await prisma.room.findUnique({
      where: { id: room.id },
      include: ROOM_INCLUDE,
    });

    if (withPlayers?.contest && withPlayers.status === "WAITING") {
      const p1 = withPlayers.player1 ?? withPlayers.host;
      const p2 = withPlayers.player2 ?? withPlayers.guest;

      if (p1 && p2) {
        try {
          await regenerateIfAlreadySolved(withPlayers.contest, p1.handle, p2.handle);
        } catch (error) {
          // A CF outage here should not block the join — the contest can still
          // run with the original problem set.
          console.error("[rooms/join] problem re-verification failed:", error);
        }
      }
    }

    void new BroadcastService(code)
      .broadcastPlayerJoined(joiningUser.handle)
      .catch(() => {});

    const finalRoom = await prisma.room.findUnique({
      where: { id: room.id },
      include: ROOM_INCLUDE,
    });

    return apiSuccess({ room: finalRoom, joined: true });
  } catch (error) {
    return handleUnexpected("rooms/[code]/join", error);
  }
}

/**
 * Replaces the problem set if either contestant has an accepted submission for
 * any of the selected problems.
 */
async function regenerateIfAlreadySolved(
  contest: {
    id: string;
    name: string;
    mode: string;
    problemCount: number;
    durationMinutes: number;
    minRating: number;
    maxRating: number;
    allowedTags: string[];
    excludedTags: string[];
    tagMatchMode: string;
    seed: string;
    problems: { problemKey: string }[];
  },
  hostHandle: string,
  guestHandle: string,
): Promise<void> {
  const [hostSolved, guestSolved] = await Promise.all([
    fetchCFUserSolvedKeys(hostHandle),
    fetchCFUserSolvedKeys(guestHandle),
  ]);

  const stale = contest.problems.some(
    (p) => hostSolved.has(p.problemKey) || guestSolved.has(p.problemKey),
  );
  if (!stale) return;

  const replacements = await generateContest({
    name: contest.name,
    mode: contest.mode as "BLITZ" | "CLASSIC" | "LOCKOUT",
    problemCount: contest.problemCount,
    durationMinutes: contest.durationMinutes,
    minRating: contest.minRating,
    maxRating: contest.maxRating,
    allowedTags: contest.allowedTags,
    excludedTags: contest.excludedTags,
    tagMatchMode: contest.tagMatchMode as "ANY" | "ALL",
    seed: `${contest.seed}-${guestHandle}`,
    hostHandle,
    guestHandle,
  });

  if (replacements.length === 0) return;

  await prisma.$transaction([
    prisma.problem.deleteMany({ where: { contestId: contest.id } }),
    prisma.problem.createMany({
      data: replacements.map((p) => ({
        contestId: contest.id,
        problemKey: p.problemKey,
        name: p.name,
        rating: p.rating,
        tags: p.tags,
        indexInContest: p.indexInContest,
      })),
    }),
    prisma.contest.update({
      where: { id: contest.id },
      data: { problemCount: replacements.length },
    }),
  ]);
}
