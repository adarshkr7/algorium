import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateContest, generateRoomCode } from "@/lib/contest-generator";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      hostId,
      hostHandle,
      name,
      mode,
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
      return NextResponse.json(
        { error: "Missing required fields (hostId, hostHandle, name, mode)" },
        { status: 400 }
      );
    }

    const actualMinRating = ratings && ratings.length > 0 ? Math.min(...ratings) : Number(minRating);
    const actualMaxRating = ratings && ratings.length > 0 ? Math.max(...ratings) : Number(maxRating);

    // 1. Generate unique 6-character room code
    let code = generateRoomCode();
    let existing = await prisma.room.findUnique({ where: { code } });
    while (existing) {
      code = generateRoomCode();
      existing = await prisma.room.findUnique({ where: { code } });
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
      return NextResponse.json(
        { error: "Could not find suitable problems matching criteria." },
        { status: 400 }
      );
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
            problemCount: generatedProblems.length,
            durationMinutes: Number(durationMinutes),
            minRating: actualMinRating,
            maxRating: actualMaxRating,
            allowedTags: JSON.stringify(allowedTags),
            excludedTags: JSON.stringify(excludedTags),
            seed: seed || code,
            status: "NOT_STARTED",
            problems: {
              create: generatedProblems.map((p) => ({
                problemKey: p.problemKey,
                name: p.name,
                rating: p.rating,
                tags: JSON.stringify(p.tags),
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

    return NextResponse.json({ room });
  } catch (error) {
    console.error("Create contest API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
