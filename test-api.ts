import { prisma } from './src/lib/prisma';
import { generateContest, generateRoomCode } from './src/lib/contest-generator';

async function test() {
  try {
    const user = await prisma.user.findFirst();
    if (!user) {
      console.log("No user found in DB");
      return;
    }
    console.log("User:", user.id, user.handle);
    
    const hostId = user.id;
    const hostHandle = user.handle;
    const name = "Test Contest";
    const mode = "CLASSIC";
    const hostingType = "PLAYER_HOST";
    const problemCount = 3;
    const durationMinutes = 30;
    const minRating = 800;
    const maxRating = 1600;
    const allowedTags = [];
    const excludedTags = [];
    const seed = "";

    const actualMinRating = minRating;
    const actualMaxRating = maxRating;

    let code = generateRoomCode();
    
    const generatedProblems = await generateContest({
      name,
      mode,
      problemCount,
      durationMinutes,
      minRating: actualMinRating,
      maxRating: actualMaxRating,
      allowedTags,
      excludedTags,
      seed: seed || code,
      hostHandle,
    });

    console.log("Generated problems:", generatedProblems.length);

    const isSupervised = false;

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
    });
    console.log("Room created successfully!");
  } catch (err) {
    console.error("Test Error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

test();
