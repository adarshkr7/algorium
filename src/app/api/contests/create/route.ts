import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateContest, generateRoomCode } from "@/lib/contest-generator";
import { requireAuth, isErrorResponse, apiError, apiSuccess } from "@/lib/api-utils";

export async function POST(req: Request) {
  try {
    const sessionOrError = await requireAuth(req);
    if (isErrorResponse(sessionOrError)) return sessionOrError;
    const session = sessionOrError;

    const body = await req.json();
    const {
      hostId,
      hostHandle,
      name,
      mode,
      pointingSystem = "ICPC",
      hostingType = "PLAYER_HOST", // "PLAYER_HOST" (Host plays) vs "SUPERVISED" (Host spectates 2 participants)
      problemCount = 3,
      durationMinutes = 30,
      minRating = 800,
      maxRating = 1600,
      allowedTags = [],
      excludedTags = [],
      ratings = undefined,
      seed = "",
    } = body;

    if (!hostId || !hostHandle || !name || !mode) {
      return apiError("Missing required fields (hostId, hostHandle, name, mode)", 400);
    }

    if (session.userId !== hostId) {
      return apiError("Unauthorized: hostId does not match session", 403);
    }

    const actualMinRating = ratings && ratings.length > 0 ? Math.min(...ratings) : Number(minRating);
    const actualMaxRating = ratings && ratings.length > 0 ? Math.max(...ratings) : Number(maxRating);

    // 0. Check if user is already in an active room
    const activeRoom = await prisma.room.findFirst({
      where: {
        OR: [
          { hostId: hostId },
          { guestId: hostId },
          { player1Id: hostId },
          { player2Id: hostId },
        ],
        status: { in: ["WAITING", "IN_PROGRESS"] },
        NOT: {
          contest: {
            participants: {
              some: {
                userId: hostId,
                hasResigned: true,
              },
            },
          },
        },
      },
    });

    if (activeRoom) {
      return apiError("You are already in an active room. Please leave it first.", 400);
    }

    // 1. Generate unique 6-character room code
    let code = generateRoomCode();
    let existing = await prisma.room.findUnique({ where: { code } });
    let retries = 0;
    while (existing && retries < 10) {
      code = generateRoomCode();
      existing = await prisma.room.findUnique({ where: { code } });
      retries++;
    }

    if (existing) {
      return apiError("Failed to generate unique room code. Please try again.", 500);
    }

    // 2. Generate problem set
    const generatedProblems = await generateContest({
      name,
      mode,
      problemCount: ratings && ratings.length > 0 ? ratings.length : Number(problemCount),
      durationMinutes: Number(durationMinutes),
      minRating: actualMinRating,
      maxRating: actualMaxRating,
      allowedTags: Array.isArray(allowedTags) ? allowedTags : [],
      excludedTags: Array.isArray(excludedTags) ? excludedTags : [],
      ratings: Array.isArray(ratings) && ratings.length > 0 ? ratings : undefined,
      seed: seed || code,
      hostHandle,
    });

    if (generatedProblems.length === 0) {
      return apiError("Could not find suitable problems matching criteria.", 400);
    }

    const isSupervised = hostingType === "SUPERVISED";

    // 3. Save Room, Contest, Problems, and Host Participant in DB
    const room = await prisma.room.create({
      data: {
        code,
        hostId,
        hostingType: isSupervised ? "SUPERVISED" : "PLAYER_HOST",
        player1Id: isSupervised ? null : hostId,
        player2Id: null,
        status: "WAITING",
        contest: {
          create: {
            name,
            mode,
            pointingSystem,
            problemCount: generatedProblems.length,
            durationMinutes: Number(durationMinutes),
            minRating: actualMinRating,
            maxRating: actualMaxRating,
            allowedTags: Array.isArray(allowedTags) ? allowedTags : [],
            excludedTags: Array.isArray(excludedTags) ? excludedTags : [],
            seed: seed || code,
            status: "NOT_STARTED",
            problems: {
              create: generatedProblems.map((p) => ({
                problemKey: p.problemKey,
                name: p.name,
                rating: p.rating,
                tags: p.tags,
                indexInContest: p.indexInContest,
              })),
            },
            participants: {
              create: {
                userId: hostId,
                role: isSupervised ? "SUPERVISOR" : "HOST",
              },
            },
          },
        },
      },
      include: {
        contest: {
          include: {
            problems: true,
            participants: {
              include: { user: true },
            },
          },
        },
        host: true,
        guest: true,
        player1: true,
        player2: true,
      },
    });

    return apiSuccess({ room }, 201);
  } catch (error) {
    console.error("Create contest API error:", error);
    return apiError("Internal server error", 500);
  }
}
