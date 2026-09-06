import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Every user field that may leave the server, and nothing else.
 *
 * Prisma's `user: true` means *all* scalar columns, which on this model
 * includes `email`, `passwordHash`, `verificationToken` and `tokenExpiresAt`.
 * Room payloads embed up to three users and are handed to the browser (and,
 * for submissions, broadcast over a public realtime channel), so a bare `true`
 * published every player's credentials — and `verificationToken` doubles as
 * the password-reset OTP, which made it an account-takeover primitive.
 *
 * Use this select anywhere a User is nested inside a response. It carries
 * everything the arena UI renders plus the counters `contest-finalizer` needs
 * to compute Elo and streaks.
 */
export const PUBLIC_USER_SELECT = {
  id: true,
  handle: true,
  avatar: true,
  rating: true,
  maxRating: true,
  rank: true,
  maxRank: true,
  elo: true,
  peakElo: true,
  wins: true,
  losses: true,
  draws: true,
  currentStreak: true,
  bestStreak: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

/** A user as the client sees them. */
export type PublicUserPayload = Prisma.UserGetPayload<{
  select: typeof PUBLIC_USER_SELECT;
}>;

const publicUser = { select: PUBLIC_USER_SELECT } as const;

/** The include shape every room-returning endpoint uses. */
export const ROOM_INCLUDE = {
  host: publicUser,
  guest: publicUser,
  player1: publicUser,
  player2: publicUser,
  series: true,
  contest: {
    include: {
      problems: { orderBy: { indexInContest: "asc" } },
      participants: { include: { user: publicUser } },
      submissions: {
        include: { user: publicUser, problem: true },
        orderBy: { timeSubmitted: "asc" },
      },
    },
  },
} satisfies Prisma.RoomInclude;

/** Room players, for the room-returning endpoints that build their own include. */
export const ROOM_PLAYERS_INCLUDE = {
  host: publicUser,
  guest: publicUser,
  player1: publicUser,
  player2: publicUser,
  series: true,
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
      // Surfaced in the open-duels list so nobody joins a proctored room
      // without knowing their camera has to be on.
      requireVideo: true,
      requireAudio: true,
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

/** True when the user occupies any seat in the room. */
export function isRoomMember(
  room: {
    hostId: string;
    guestId: string | null;
    player1Id: string | null;
    player2Id: string | null;
  },
  userId: string,
): boolean {
  return (
    room.hostId === userId ||
    room.guestId === userId ||
    room.player1Id === userId ||
    room.player2Id === userId
  );
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
