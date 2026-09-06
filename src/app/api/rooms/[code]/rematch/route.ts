import { ParticipantRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateContest, generateRoomCode } from "@/lib/contest-generator";
import {
  apiError,
  apiSuccess,
  enforceRateLimit,
  handleUnexpected,
  isErrorResponse,
  parseBody,
  requireAuth,
} from "@/lib/api-utils";
import { RematchSchema } from "@/lib/validation";
import {
  ROOM_INCLUDE,
  ROOM_PLAYERS_INCLUDE,
  findActiveRoomForUser,
} from "@/lib/services/room-service";
import { BroadcastService } from "@/lib/services/broadcast";

/**
 * POST /api/rooms/[code]/rematch
 *
 * Clones a finished room's settings into a new room with a fresh problem set,
 * pre-seating both players, and tells the opponent where to go via realtime.
 *
 * If the source room belongs to an unfinished best-of series, the new room
 * becomes the next game in that series instead of starting a new one.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const limited = await enforceRateLimit(
      req,
      10,
      60_000,
      "Too many rematch requests. Wait a moment.",
    );
    if (limited) return limited;

    const session = await requireAuth(req);
    if (isErrorResponse(session)) return session;

    const body = await parseBody(req, RematchSchema);
    if (isErrorResponse(body)) return body;

    const { code: rawCode } = await params;
    if (!rawCode || rawCode.length !== 6) {
      return apiError("Invalid room code", 400, { code: "INVALID_CODE" });
    }
    const code = rawCode.toUpperCase();
    const userId = session.userId;

    const source = await prisma.room.findUnique({
      where: { code },
      include: { contest: true, ...ROOM_PLAYERS_INCLUDE },
    });

    if (!source || !source.contest) {
      return apiError("Room not found", 404, { code: "ROOM_NOT_FOUND" });
    }
    if (source.status !== "FINISHED") {
      return apiError("You can only rematch a finished contest", 409, {
        code: "NOT_FINISHED",
      });
    }
    if (source.contest.isSolo) {
      return apiError("Solo practice runs cannot be rematched", 409, {
        code: "SOLO_ROOM",
      });
    }

    const p1 = source.player1 ?? source.host;
    const p2 = source.player2 ?? source.guest;
    if (!p1 || !p2) {
      return apiError("That contest did not have two players", 409, {
        code: "INCOMPLETE_MATCH",
      });
    }
    if (userId !== p1.id && userId !== p2.id && userId !== source.hostId) {
      return apiError("Only the players can start a rematch", 403, {
        code: "NOT_A_PLAYER",
      });
    }

    // Someone may already have hit Rematch — hand back the same room rather
    // than creating a second one.
    const existing = await prisma.room.findFirst({
      where: {
        rematchOfCode: code,
        status: { in: ["WAITING", "IN_PROGRESS"] },
      },
      include: ROOM_INCLUDE,
    });
    if (existing) {
      return apiSuccess({ room: existing, created: false });
    }

    for (const player of [p1, p2]) {
      const busy = await findActiveRoomForUser(player.id);
      if (busy) {
        return apiError(
          player.id === userId
            ? `You're already in room ${busy.code}.`
            : `${player.handle} is already in another room.`,
          409,
          { code: "ALREADY_IN_ROOM" },
        );
      }
    }

    // ── Series continuation ────────────────────────────────────────────────
    const series = source.series;
    const continuingSeries = series && series.status === "IN_PROGRESS";
    const gameNumber = continuingSeries ? source.gameNumber + 1 : 1;

    // ── Fresh problems, same settings ──────────────────────────────────────
    const c = source.contest;
    const durationMinutes = body.durationMinutes ?? c.durationMinutes;

    let newCode = generateRoomCode();
    for (let i = 0; i < 10; i++) {
      const clash = await prisma.room.findUnique({
        where: { code: newCode },
        select: { id: true },
      });
      if (!clash) break;
      newCode = generateRoomCode();
    }

    const problems = await generateContest({
      name: c.name,
      mode: c.mode,
      problemCount: c.problemCount,
      durationMinutes,
      minRating: c.minRating,
      maxRating: c.maxRating,
      allowedTags: c.allowedTags,
      excludedTags: c.excludedTags,
      tagMatchMode: c.tagMatchMode,
      // A new seed, otherwise the rematch would reuse the same problem set.
      seed: newCode,
      hostHandle: p1.handle,
      guestHandle: p2.handle,
    });

    if (problems.length === 0) {
      return apiError(
        "Couldn't find fresh problems for a rematch with these settings.",
        422,
        { code: "NO_PROBLEMS_FOUND" },
      );
    }

    const isSupervised = source.hostingType === "SUPERVISED";

    const room = await prisma.room.create({
      data: {
        code: newCode,
        hostId: source.hostId,
        hostingType: source.hostingType,
        guestId: p2.id,
        player1Id: p1.id,
        player2Id: p2.id,
        status: "WAITING",
        isPublic: false,
        rematchOfCode: code,
        seriesId: continuingSeries ? series!.id : null,
        gameNumber,
        contest: {
          create: {
            name: continuingSeries ? `${c.name} — Game ${gameNumber}` : c.name,
            mode: c.mode,
            pointingSystem: c.pointingSystem,
            problemCount: problems.length,
            durationMinutes,
            minRating: c.minRating,
            maxRating: c.maxRating,
            allowedTags: c.allowedTags,
            excludedTags: c.excludedTags,
            tagMatchMode: c.tagMatchMode,
            isSolo: false,
            seed: newCode,
            status: "NOT_STARTED",
            problems: {
              create: problems.map((p) => ({
                problemKey: p.problemKey,
                name: p.name,
                rating: p.rating,
                tags: p.tags,
                indexInContest: p.indexInContest,
              })),
            },
            participants: {
              create: [
                {
                  userId: p1.id,
                  role: isSupervised
                    ? ParticipantRole.PLAYER_1
                    : ParticipantRole.HOST,
                },
                {
                  userId: p2.id,
                  role: isSupervised
                    ? ParticipantRole.PLAYER_2
                    : ParticipantRole.GUEST,
                },
                ...(isSupervised
                  ? [
                      {
                        userId: source.hostId,
                        role: ParticipantRole.SUPERVISOR,
                      },
                    ]
                  : []),
              ],
            },
          },
        },
      },
      include: ROOM_INCLUDE,
    });

    const requester = userId === p1.id ? p1 : p2;

    // Notify the old room so the opponent's results screen offers the link.
    await new BroadcastService(code).broadcastRematchReady(
      newCode,
      requester.handle,
      gameNumber,
    );

    return apiSuccess({ room, created: true }, 201);
  } catch (error) {
    return handleUnexpected("rooms/[code]/rematch", error);
  }
}
