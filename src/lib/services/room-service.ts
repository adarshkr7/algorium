import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** The include shape every room-returning endpoint uses. */
export const ROOM_INCLUDE = {
  host: true,
  guest: true,
  player1: true,
  player2: true,
  series: true,
  contest: {
    include: {
      problems: { orderBy: { indexInContest: "asc" } },
      participants: { include: { user: true } },
      submissions: {
        include: { user: true, problem: true },
        orderBy: { timeSubmitted: "asc" },
      },
    },
  },
} satisfies Prisma.RoomInclude;

export type FullRoom = Prisma.RoomGetPayload<{ include: typeof ROOM_INCLUDE }>;

/** Lighter include for lobby listings. */
export const ROOM_SUMMARY_INCLUDE = {
  host: {
    select: { id: true, handle: true, avatar: true, rating: true, elo: true },
  },
  contest: {
    select: {
      name: true,
      mode: true,
      pointingSystem: true,
      problemCount: true,
      durationMinutes: true,
      minRating: true,
      maxRating: true,
    },
  },
  series: { select: { bestOf: true } },
} satisfies Prisma.RoomInclude;

/**
 * A user may only occupy one live room at a time.
 *
 * "Live" excludes rooms the user has already resigned from, so quitting a
 * contest genuinely frees them up to start another one.
 */
export function activeRoomWhere(userId: string): Prisma.RoomWhereInput {
  return {
    OR: [
      { hostId: userId },
      { guestId: userId },
      { player1Id: userId },
      { player2Id: userId },
    ],
    status: { in: ["WAITING", "IN_PROGRESS"] },
    NOT: {
      contest: {
        participants: { some: { userId, hasResigned: true } },
      },
    },
  };
}

export async function findActiveRoomForUser(userId: string) {
  return prisma.room.findFirst({
    where: activeRoomWhere(userId),
    include: {
      contest: {
        select: {
          id: true,
          name: true,
          mode: true,
          status: true,
          durationMinutes: true,
          isSolo: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Resolves the two contestants regardless of hosting mode. */
export function resolvePlayers<
  T extends {
    hostingType: string;
    host?: unknown;
    guest?: unknown;
    player1?: unknown;
    player2?: unknown;
  },
>(room: T) {
  const supervised = room.hostingType === "SUPERVISED";
  return {
    isSupervised: supervised,
    player1: (supervised ? room.player1 : room.host) ?? null,
    player2: (supervised ? room.player2 : room.guest) ?? null,
  };
}
