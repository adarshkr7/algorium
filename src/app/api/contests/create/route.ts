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
import { CreateContestSchema } from "@/lib/validation";
import {
  findActiveRoomForUser,
  PUBLIC_USER_SELECT,
  ROOM_PLAYERS_INCLUDE,
} from "@/lib/services/room-service";

const MAX_CODE_ATTEMPTS = 10;

/**
 * POST /api/contests/create
 *
 * The host id is taken from the session rather than the request body — the
 * previous version accepted `hostId` from the client and then compared it to
 * the session, which was redundant and easy to get wrong.
 */
export async function POST(req: Request) {
  try {
    const limited = await enforceRateLimit(
      req,
      10,
      60_000,
      "You're creating rooms too quickly. Wait a minute and try again.",
    );
    if (limited) return limited;

    const session = await requireAuth(req);
    if (isErrorResponse(session)) return session;

    const body = await parseBody(req, CreateContestSchema);
    if (isErrorResponse(body)) return body;

    const host = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, handle: true },
    });
    if (!host) return apiError("Your account no longer exists", 404);

    // ── One active room per user ───────────────────────────────────────────
    const activeRoom = await findActiveRoomForUser(host.id);
    if (activeRoom) {
      return apiError(
        `You're already in room ${activeRoom.code}. Leave it before creating another.`,
        409,
        { code: "ALREADY_IN_ROOM", details: { code: activeRoom.code } },
      );
    }

    const usingExactRatings = Boolean(body.ratings && body.ratings.length > 0);
    const problemCount = usingExactRatings
      ? body.ratings!.length
      : body.problemCount;
    const minRating = usingExactRatings
      ? Math.min(...body.ratings!)
      : body.minRating;
    const maxRating = usingExactRatings
      ? Math.max(...body.ratings!)
      : body.maxRating;

    // ── Unique room code ───────────────────────────────────────────────────
    let code = generateRoomCode();
    for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) {
      const clash = await prisma.room.findUnique({
        where: { code },
        select: { id: true },
      });
      if (!clash) break;
      code = generateRoomCode();
      if (i === MAX_CODE_ATTEMPTS - 1) {
        return apiError("Could not allocate a room code. Please retry.", 503);
      }
    }

    // ── Problem selection ──────────────────────────────────────────────────
    const problems = await generateContest({
      name: body.name,
      mode: body.mode,
      problemCount,
      durationMinutes: body.durationMinutes,
      minRating,
      maxRating,
      allowedTags: body.allowedTags,
      excludedTags: body.excludedTags,
      tagMatchMode: body.tagMatchMode,
      ratings: usingExactRatings ? body.ratings : undefined,
      seed: body.seed || code,
      hostHandle: host.handle,
    });

    if (problems.length === 0) {
      return apiError(
        "No Codeforces problems matched those filters that you haven't already solved. Try widening the rating range or removing tags.",
        422,
        { code: "NO_PROBLEMS_FOUND" },
      );
    }

    const isSupervised = body.hostingType === "SUPERVISED";
    const isSolo = body.isSolo && !isSupervised;

    // A practice run has no audience, so the toggles are meaningless there.
    // The schema already rejects the combination; this keeps the stored row
    // consistent if `isSolo` was forced on by the supervised check above.
    const requireVideo = body.requireVideo && !isSolo;
    const requireAudio = body.requireAudio && !isSolo;

    // ── Optional best-of series ────────────────────────────────────────────
    let seriesId: string | null = null;
    if (body.bestOf > 1 && !isSolo && !isSupervised) {
      const series = await prisma.matchSeries.create({
        data: { bestOf: body.bestOf, player1Id: host.id },
        select: { id: true },
      });
      seriesId = series.id;
    }

    const room = await prisma.room.create({
      data: {
        code,
        hostId: host.id,
        hostingType: isSupervised ? "SUPERVISED" : "PLAYER_HOST",
        player1Id: isSupervised ? null : host.id,
        player2Id: null,
        status: "WAITING",
        // A solo run is never listed publicly — there is nothing to join.
        isPublic: body.isPublic && !isSolo,
        seriesId,
        gameNumber: 1,
        contest: {
          create: {
            name: body.name,
            mode: body.mode,
            pointingSystem: body.pointingSystem,
            problemCount: problems.length,
            durationMinutes: body.durationMinutes,
            minRating,
            maxRating,
            allowedTags: body.allowedTags,
            excludedTags: body.excludedTags,
            tagMatchMode: body.tagMatchMode,
            isSolo,
            requireVideo,
            requireAudio,
            mediaGraceSeconds: body.mediaGraceSeconds,
            mediaViolationAction: body.mediaViolationAction,
            seed: body.seed || code,
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
              create: {
                userId: host.id,
                role: isSupervised ? "SUPERVISOR" : "HOST",
              },
            },
          },
        },
      },
      include: {
        contest: {
          include: {
            problems: { orderBy: { indexInContest: "asc" } },
            participants: { include: { user: { select: PUBLIC_USER_SELECT } } },
          },
        },
        ...ROOM_PLAYERS_INCLUDE,
      },
    });

    // Fewer problems than requested means the filters were tight — tell the
    // host rather than silently handing them a shorter contest.
    const shortfall =
      problems.length < problemCount
        ? `Only ${problems.length} of ${problemCount} problems matched your filters.`
        : null;

    return apiSuccess({ room, warning: shortfall }, 201);
  } catch (error) {
    return handleUnexpected("contests/create", error, req);
  }
}
