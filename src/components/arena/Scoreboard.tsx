"use client";

import { Activity, Trophy } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatClockTime } from "@/lib/format";
import {
  compareStats,
  primaryScore,
  primaryScoreLabel,
  type ParticipantStats,
  type Standings,
} from "@/lib/services/standings";
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  SectionTitle,
  VerdictBadge,
} from "@/components/ui";
import type { ArenaPlayer, ArenaSubmission } from "./types";

interface ContestShape {
  mode: string;
  pointingSystem: string;
}

export function Scoreboard({
  contest,
  standings,
  player1,
  player2,
  currentUserId,
  isSolo,
}: {
  contest: ContestShape;
  standings: Standings | null;
  player1: ArenaPlayer | null;
  player2: ArenaPlayer | null;
  currentUserId?: string;
  isSolo?: boolean;
}) {
  const rows = [
    { player: player1, stats: standings?.host ?? null, fallback: "Player 1" },
    { player: player2, stats: standings?.guest ?? null, fallback: "Player 2" },
  ]
    .filter((row) => !isSolo || row.player)
    .sort((a, b) => compareStats(contest, a.stats, b.stats));

  const scoreLabel = primaryScoreLabel(contest);
  const showPenalty =
    contest.mode === "CLASSIC" || contest.pointingSystem === "POINTS";

  return (
    <Card padding="sm" className="flex flex-col gap-3">
      <SectionTitle icon={<Trophy className="size-4 text-warning" />}>
        {isSolo ? "Progress" : "Scoreboard"}
      </SectionTitle>

      <div className="flex flex-col">
        {rows.map((row, rank) => (
          <ScoreRow
            key={row.player?.id ?? row.fallback}
            rank={rank}
            player={row.player}
            fallback={row.fallback}
            stats={row.stats}
            score={primaryScore(contest, row.stats)}
            scoreLabel={scoreLabel}
            showPenalty={showPenalty}
            isYou={Boolean(currentUserId && row.player?.id === currentUserId)}
            showMedal={!isSolo}
          />
        ))}
      </div>
    </Card>
  );
}

function ScoreRow({
  rank,
  player,
  fallback,
  stats,
  score,
  scoreLabel,
  showPenalty,
  isYou,
  showMedal,
}: {
  rank: number;
  player: ArenaPlayer | null;
  fallback: string;
  stats: ParticipantStats | null;
  score: number;
  scoreLabel: string;
  showPenalty: boolean;
  isYou: boolean;
  showMedal: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 border-b border-white/6 py-3.5 last:border-0 sm:gap-4",
        stats?.hasResigned && "opacity-60",
      )}
    >
      {showMedal && (
        <span className="mono-emoji w-6 shrink-0 text-center text-lg">
          {rank === 0 ? "🥇" : "🥈"}
        </span>
      )}
      <Avatar
        src={player?.avatar}
        alt={player?.handle ?? fallback}
        size="sm"
        ring={isYou ? "brand" : "none"}
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-[0.95rem] font-extrabold text-ink">
            {player?.handle ?? fallback}
          </span>
          {isYou && <Badge tone="solid">You</Badge>}
          {stats?.hasResigned && <Badge tone="danger">Resigned</Badge>}
        </div>
        {player && (
          <p className="mt-0.5 font-mono text-[0.68rem] text-ink-faint">
            {player.elo} Elo
          </p>
        )}
      </div>

      <div className="shrink-0 text-right font-mono">
        <div className="text-base font-extrabold text-success sm:text-lg">
          {score}{" "}
          <span className="text-[0.7rem] font-bold text-ink-faint uppercase">
            {scoreLabel}
          </span>
        </div>
        {showPenalty && (
          <div className="text-[0.68rem] text-ink-faint">
            +{stats?.penaltyMinutes ?? 0}m penalty
          </div>
        )}
      </div>
    </div>
  );
}

/** Reverse-chronological submission feed. */
export function ActivityFeed({
  submissions,
  currentUserId,
  className,
}: {
  submissions: ArenaSubmission[];
  currentUserId?: string;
  className?: string;
}) {
  const ordered = [...submissions].sort(
    (a, b) =>
      new Date(b.timeSubmitted).getTime() - new Date(a.timeSubmitted).getTime(),
  );

  return (
    <Card padding="sm" className={cn("flex flex-col gap-3", className)}>
      <SectionTitle icon={<Activity className="size-4" />}>
        Recent activity
      </SectionTitle>

      {ordered.length === 0 ? (
        <EmptyState
          title="No submissions yet"
          message="Verdicts appear here the moment Codeforces judges them."
          className="border-0 bg-transparent py-6"
        />
      ) : (
        <div className="-mr-1 flex max-h-80 flex-col overflow-y-auto pr-1">
          {ordered.map((sub, idx) => (
            <div
              key={`${sub.id ?? sub.cfSubmissionId}-${idx}`}
              className="flex items-center justify-between gap-3 border-b border-white/6 py-2.5 last:border-0"
            >
              <div className="min-w-0">
                <p className="truncate text-[0.85rem] font-bold text-ink">
                  {sub.user?.handle ?? "Player"}
                  {currentUserId && sub.userId === currentUserId && (
                    <span className="ml-1.5 text-[0.68rem] font-semibold text-ink-faint">
                      (you)
                    </span>
                  )}
                </p>
                <p className="truncate text-[0.72rem] text-ink-faint">
                  {sub.problem?.name ?? "Problem"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="hidden font-mono text-[0.68rem] text-ink-faint xs:inline">
                  {formatClockTime(sub.timeSubmitted)}
                </span>
                <VerdictBadge verdict={sub.verdict} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
