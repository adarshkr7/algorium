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
      return NextResponse.json({ error: "Room code and userId are required" }, { status: 400 });
    }

    const room = await prisma.room.findUnique({
      where: { code: code.toUpperCase() },
      include: { contest: true },
    });

    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    if (room.hostId === userId) {
      // Host leaves: cancel room or set status to FINISHED
      await prisma.room.update({
        where: { id: room.id },
        data: { status: "FINISHED" },
      });
      if (room.contest) {
        await prisma.contest.update({
          where: { id: room.contest.id },
          data: { status: "FINISHED" },
        });
      }
    } else if (room.guestId === userId) {
      // Guest leaves: remove guestId from room
      await prisma.room.update({
        where: { id: room.id },
        data: { guestId: null },
      });
      if (room.contest) {
        await prisma.participant.deleteMany({
          where: { contestId: room.contest.id, userId },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Leave room API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
