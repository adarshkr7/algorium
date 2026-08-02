import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    if (!code) {
      return NextResponse.json({ error: "Room code is required" }, { status: 400 });
    }

    const room = await prisma.room.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        host: true,
        guest: true,
        player1: true,
        player2: true,
        contest: {
          include: {
            problems: {
              orderBy: { indexInContest: "asc" },
            },
            participants: {
              include: { user: true },
            },
            submissions: {
              include: { user: true, problem: true },
              orderBy: { timeSubmitted: "asc" },
            },
          },
        },
      },
    });

    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    return NextResponse.json({ room });
  } catch (error) {
    console.error("Get room API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
