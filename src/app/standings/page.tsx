import Link from "next/link";
import type { Metadata } from "next";
import { Flame, Trophy } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/cn";
import { eloTier } from "@/lib/elo";
import { Avatar, Badge, EmptyState, PageHeader } from "@/components/ui";
// This page is a server component, so buttonStyles is imported from the
// boundary-free module rather than through the (client-heavy) barrel.
import { buttonStyles } from "@/components/ui/button-styles";

export const metadata: Metadata = { title: "Standings" };
export const revalidate = 60;

const LIMIT = 100;

export default async function StandingsPage() {
  // Only players who have actually duelled belong on the ladder — otherwise
  // every handle ever searched shows up at the default 1200.
  const users = await prisma.user.findMany({
    where: {
      OR: [{ wins: { gt: 0 } }, { losses: { gt: 0 } }, { draws: { gt: 0 } }],
    },
    orderBy: [{ elo: "desc" }, { wins: "desc" }, { handle: "asc" }],
    take: LIMIT,
    select: {
      id: true,
      handle: true,
      avatar: true,
      rating: true,
      rank: true,
      elo: true,
      wins: true,
      losses: true,
      draws: true,
      currentStreak: true,
    },
  });

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        icon={<Trophy className="size-5 text-warning" />}
        eyebrow="Ladder"
        title="Global standings"
        description="Ranked by Algorium Elo — earned in duels, separate from your Codeforces rating."
      />

      {users.length === 0 ? (
        <EmptyState
          icon={<Trophy className="size-5" />}
          title="Nobody has duelled yet"
          message="Be the first on the board — host a room and win a match."
          action={
            <Link
              href="/create"
              className={buttonStyles({
                variant: "secondary",
                size: "sm",
                className: "mt-1",
              })}
            >
              Host a duel
            </Link>
          }
        />
      ) : (
        <ol className="flex flex-col">
          {users.map((user, i) => {
            const tier = eloTier(user.elo);
            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;

            return (
              <li key={user.id}>
                <Link
                  href={`/profile/${encodeURIComponent(user.handle)}`}
                  className="flex items-center gap-3 border-b border-white/6 px-1 py-4 no-underline transition-colors hover:bg-white/3 sm:gap-5 sm:px-3"
                >
                  <span
                    className={cn(
                      "w-8 shrink-0 text-center font-mono text-sm font-extrabold sm:w-10 sm:text-base",
                      i < 3 ? "text-warning" : "text-ink-faint",
                    )}
                  >
                    {medal ?? `#${i + 1}`}
                  </span>

                  <Avatar src={user.avatar} alt={user.handle} size="sm" />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate text-[0.95rem] font-extrabold text-ink sm:text-lg">
                        {user.handle}
                      </span>
                      {user.currentStreak >= 3 && (
                        <Badge tone="warning" icon={<Flame className="size-3" />}>
                          {user.currentStreak}
                        </Badge>
                      )}
                    </div>
                    <p className="text-eyebrow mt-1 flex flex-wrap gap-x-2 text-ink-faint">
                      <span className={tier.className}>{tier.name}</span>
                      <span className="hidden xs:inline">·</span>
                      <span className="hidden xs:inline">
                        CF {user.rating || "unrated"}
                      </span>
                    </p>
                  </div>

                  <div className="shrink-0 text-right font-mono">
                    <p className="text-base font-extrabold text-ink sm:text-lg">
                      {user.elo}
                    </p>
                    <p className="mt-0.5 text-[0.68rem] text-ink-faint">
                      <span className="text-success">{user.wins}</span>
                      {" / "}
                      <span className="text-danger">{user.losses}</span>
                      {" / "}
                      {user.draws}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
