import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const { userId } = await req.json();

    if (!code || !userId) {
      return NextResponse.json({ error: "Code and userId are required" }, { status: 400 });
    }

    const uppercaseCode = code.toUpperCase();
    const room = await prisma.room.findUnique({
      where: { code: uppercaseCode },
      include: { contest: true },
    });

    if (!room || !room.contest) {
      return NextResponse.json({ error: "Room or contest not found" }, { status: 404 });
    }

    if (room.hostId !== userId) {
      return NextResponse.json({ error: "Only the host can start the contest" }, { status: 403 });
    }

    if (room.status === "IN_PROGRESS" || room.status === "FINISHED") {
      return NextResponse.json({ room });
    }

    const startTime = new Date();
    const durationMs = room.contest.durationMinutes * 60 * 1000;
    const endTime = new Date(startTime.getTime() + durationMs);

    const updatedRoom = await prisma.room.update({
      where: { id: room.id },
      data: {
        status: "IN_PROGRESS",
        contest: {
          update: {
            status: "IN_PROGRESS",
            startTime,
            endTime,
          },
        },
      },
      include: {
        host: true,
        guest: true,
        player1: true,
        player2: true,
        contest: true,
      },
    });

    return NextResponse.json({ room: updatedRoom });
  } catch (error: any) {
    console.error("Start contest API error:", error);
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}
