import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const activeRoom = await prisma.room.findFirst({
      where: {
        OR: [
          { hostId: userId },
          { guestId: userId },
          { player1Id: userId },
          { player2Id: userId },
        ],
        status: { in: ["WAITING", "IN_PROGRESS"] },
      },
      include: {
        contest: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!activeRoom) {
      return NextResponse.json({ room: null });
    }

    return NextResponse.json({ room: activeRoom });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
