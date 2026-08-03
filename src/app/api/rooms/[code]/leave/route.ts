import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";

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

    if (room.status === "IN_PROGRESS" && room.contest) {
      // Mark the participant as resigned
      const participant = await prisma.participant.findFirst({
        where: { contestId: room.contest.id, userId },
      });

      if (participant) {
        await prisma.participant.update({
          where: { id: participant.id },
          data: { hasResigned: true },
        });

        // Check if all participants (host and guest) have resigned
        const participants = await prisma.participant.findMany({
          where: { contestId: room.contest.id },
        });
        
        const allResigned = participants.length > 0 && participants.every((p) => p.hasResigned);
        
        if (allResigned) {
          // If both resigned, end the contest
          await prisma.room.update({
            where: { id: room.id },
            data: { status: "FINISHED" },
          });
          await prisma.contest.update({
            where: { id: room.contest.id },
            data: { status: "FINISHED", endTime: new Date() },
          });
        }
      }
    } else {
      // Room hasn't started yet, or finished. Anyone leaving cancels the room for everyone.
      await prisma.room.update({
        where: { id: room.id },
        data: { status: "CANCELLED" },
      });
      if (room.contest) {
        await prisma.contest.update({
          where: { id: room.contest.id },
          data: { status: "CANCELLED" },
        });
      }

      const leaver = await prisma.user.findUnique({ where: { id: userId } });
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
      );
      const channel = supabase.channel(`room-${code}`);
      await channel.send({
        type: 'broadcast',
        event: 'room-cancelled',
        payload: { by: leaver?.handle || 'A user' }
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Leave room API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
