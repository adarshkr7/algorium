"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import confetti from "canvas-confetti";
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Lock,
  Medal,
  RotateCcw,
  Swords,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { apiFetch, errorMessage } from "@/lib/api-client";
import {
  codeforcesProblemUrl,
  formatClockTime,
  formatEloDelta,
  formatSolveTime,
  problemLetter,
} from "@/lib/format";
import {
  compareStats,
  primaryScore,
  primaryScoreLabel,
  problemPoints,
  type Standings,
} from "@/lib/services/standings";
import {
  Avatar,
  Badge,
  Button,
  buttonStyles,
  Card,
  EmptyState,
  RatingBadge,
  SectionTitle,
  useToast,
  VerdictBadge,
} from "@/components/ui";
import type {
  ArenaContest,
  ArenaPlayer,
  ArenaProblem,
  ArenaSubmission,
  ArenaSeries,
  WinnerInfo,
} from "./types";

export function ResultsScreen({
  code,
  contest,
  problems,
  submissions,
  standings,
  player1,
  player2,
  winnerInfo,
  series,
  currentUserId,
  canRematch,
}: {
  code: string;
  contest: ArenaContest;
  problems: ArenaProblem[];
  submissions: ArenaSubmission[];
  standings: Standings | null;
  player1: ArenaPlayer | null;
  player2: ArenaPlayer | null;
  winnerInfo: WinnerInfo | null;
  series: ArenaSeries | null;
  currentUserId?: string;
  canRematch: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [rematching, setRematching] = useState(false);

  const isSolo = contest.isSolo;
  const winnerId = winnerInfo?.winnerId ?? null;
  const isDraw = winnerInfo?.isDraw ?? !winnerId;
  const winnerHandle =
    winnerInfo?.winnerHandle ??
    (winnerId === player1?.id
      ? player1?.handle
      : winnerId === player2?.id
        ? player2?.handle
        : null);

  const iWon = Boolean(currentUserId && winnerId === currentUserId);

  useEffect(() => {
    if (!iWon) return;
    confetti({ particleCount: 130, spread: 82, origin: { y: 0.6 } });
  }, [iWon]);

  const rows = [
    { player: player1, stats: standings?.host ?? null, fallback: "Player 1" },
    { player: player2, stats: standings?.guest ?? null, fallback: "Player 2" },
  ]
    .filter((row) => !isSolo || row.player)
    .sort((a, b) => compareStats(contest, a.stats, b.stats));

  const scoreLabel = primaryScoreLabel(contest);
  const eloChanges = winnerInfo?.eloChanges ?? {};

  const orderedSubmissions = [...submissions].sort(
    (a, b) =>
      new Date(a.timeSubmitted).getTime() - new Date(b.timeSubmitted).getTime(),
  );

  const seriesDecided = series?.status === "FINISHED";

  async function startRematch() {
    setRematching(true);
    try {
      const data = await apiFetch<{ room: { code: string } }>(
        `/api/rooms/${code}/rematch`,
        { method: "POST", body: {} },
      );
      router.push(`/room/${data.room.code}`);
    } catch (err) {
      toast.push(errorMessage(err, "Couldn't set up a rematch."), "danger");
      setRematching(false);
    }
  }

  return (
    <div className="stagger flex flex-col gap-7">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-4 border-b border-white/6 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-warning/10">
            <Trophy className="size-5 text-warning" />
          </span>
          <div className="min-w-0">
            <h1 className="text-display-sm truncate text-ink">{contest.name}</h1>
            <p className="mt-1 font-mono text-[0.78rem] text-ink-faint">
              Room {code} · {contest.mode} · {contest.durationMinutes}m
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Badge tone="danger">Finished</Badge>
          <Link
            href="/"
            className={buttonStyles({ variant: "outline", size: "sm" })}
          >
            <ArrowLeft className="size-3.5" />
            Home
          </Link>
        </div>
      </header>

      {/* ── Outcome ───────────────────────────────────────────────────────── */}
      <div
        className={cn(
          "rounded-xl border px-5 py-7 text-center",
          isSolo
            ? "border-white/8 bg-white/2"
            : isDraw
              ? "border-white/8 bg-white/2"
              : "border-warning/25 bg-warning/6",
        )}
      >
        <p
          className={cn(
            "text-2xl font-extrabold tracking-tight sm:text-3xl",
            isSolo || isDraw ? "text-ink" : "text-warning",
          )}
        >
          {isSolo
            ? "Practice complete"
            : isDraw
              ? "It's a draw"
              : `${winnerHandle} wins`}
        </p>

        {winnerInfo?.reason === "resignation" && (
          <p className="mt-2 text-sm text-ink-dim">Ended by resignation.</p>
        )}
        {winnerInfo?.reason === "time_expired" && (
          <p className="mt-2 text-sm text-ink-dim">Time ran out.</p>
        )}

        {series && series.bestOf > 1 && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Badge tone="neutral">
              Series {series.player1Wins}–{series.player2Wins}
            </Badge>
            <Badge tone={seriesDecided ? "success" : "warning"}>
              {seriesDecided
                ? "Series decided"
                : `First to ${Math.floor(series.bestOf / 2) + 1}`}
            </Badge>
          </div>
        )}

        {canRematch && !seriesDecided && (
          <Button
            variant="primary"
            size="lg"
            className="mt-6"
            loading={rematching}
            loadingText="Setting up…"
            onClick={startRematch}
            icon={<RotateCcw className="size-4" />}
          >
            {series && series.bestOf > 1 ? "Play next game" : "Rematch"}
          </Button>
        )}
      </div>

      {/* ── Leaderboard ───────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <SectionTitle icon={<Medal className="size-4 text-warning" />}>
          Final standings
        </SectionTitle>

        <div className="flex flex-col">
          {rows.map((row, rank) => {
            const delta = row.player ? eloChanges[row.player.id] : undefined;
            return (
              <div
                key={row.player?.id ?? row.fallback}
                className={cn(
                  "flex items-center gap-3 border-b border-white/6 py-5 sm:gap-5",
                  row.player?.id === winnerId && "bg-warning/4",
                )}
              >
                {!isSolo && (
                  <span className="w-7 shrink-0 text-center text-xl">
                    {rank === 0 ? "🥇" : "🥈"}
                  </span>
                )}
                <Avatar
                  src={row.player?.avatar}
                  alt={row.player?.handle ?? row.fallback}
                  size="md"
                  ring={row.player?.id === winnerId ? "warning" : "none"}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-extrabold text-ink">
                    {row.player?.handle ?? row.fallback}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-[0.7rem] text-ink-faint">
                    <span>{row.player?.elo ?? "—"} Elo</span>
                    {delta !== undefined && (
                      <span
                        className={cn(
                          "font-bold",
                          delta > 0
                            ? "text-success"
                            : delta < 0
                              ? "text-danger"
                              : "text-ink-faint",
                        )}
                      >
                        {formatEloDelta(delta)}
                      </span>
                    )}
                  </p>
                </div>
                <div className="shrink-0 text-right font-mono">
                  <p className="text-lg font-extrabold text-success">
                    {primaryScore(contest, row.stats)}{" "}
                    <span className="text-[0.7rem] font-bold text-ink-faint uppercase">
                      {scoreLabel}
                    </span>
                  </p>
                  <p className="text-[0.68rem] text-ink-faint">
                    +{row.stats?.penaltyMinutes ?? 0}m penalty
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Problem breakdown ─────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <SectionTitle icon={<Swords className="size-4" />}>Problems</SectionTitle>

        <div className="flex flex-col gap-2.5">
          {problems.map((problem, idx) => {
            const p1AC = orderedSubmissions.find(
              (s) =>
                s.problemId === problem.id &&
                s.userId === player1?.id &&
                s.verdict === "OK",
            );
            const p2AC = orderedSubmissions.find(
              (s) =>
                s.problemId === problem.id &&
                s.userId === player2?.id &&
                s.verdict === "OK",
            );
            const lockerHandle =
              problem.lockedWinnerId === player1?.id
                ? player1?.handle
                : problem.lockedWinnerId === player2?.id
                  ? player2?.handle
                  : null;

            return (
              <Card key={problem.id} padding="sm" className="flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <span className="font-mono text-lg font-extrabold text-ink-faint">
                    {problemLetter(idx)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.95rem] font-bold text-ink">
                      {problem.name}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <RatingBadge rating={problem.rating} />
                      {contest.pointingSystem === "POINTS" && (
                        <Badge tone="success">
                          {problemPoints(problem.indexInContest ?? idx)} pts
                        </Badge>
                      )}
                      <Badge tone="neutral" className="font-mono">
                        {problem.problemKey}
                      </Badge>
                    </div>
                  </div>
                  <a
                    href={codeforcesProblemUrl(problem.problemKey)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open ${problem.name} on Codeforces`}
                    className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/10 text-ink-dim transition-colors hover:text-ink"
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {lockerHandle && (
                    <Badge tone="danger" icon={<Lock className="size-3" />}>
                      Locked by {lockerHandle}
                    </Badge>
                  )}
                  {p1AC && (
                    <Badge tone="success" icon={<CheckCircle2 className="size-3" />}>
                      {player1?.handle} {formatSolveTime(p1AC.solveTimeSeconds)}
                    </Badge>
                  )}
                  {p2AC && (
                    <Badge tone="success" icon={<CheckCircle2 className="size-3" />}>
                      {player2?.handle} {formatSolveTime(p2AC.solveTimeSeconds)}
                    </Badge>
                  )}
                  {!p1AC && !p2AC && !lockerHandle && (
                    <Badge tone="neutral">Unsolved</Badge>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* ── Submission log ────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <SectionTitle icon={<Activity className="size-4" />}>
          Submission log
        </SectionTitle>

        {orderedSubmissions.length === 0 ? (
          <EmptyState
            title="No submissions were recorded"
            message="Nothing was submitted to these problems during the contest window."
          />
        ) : (
          <>
            {/* Table on tablet and up */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full border-separate border-spacing-y-1.5">
                <thead>
                  <tr>
                    {["Time", "Player", "Problem", "Verdict", "Solve time"].map(
                      (heading) => (
                        <th
                          key={heading}
                          className="text-eyebrow border-b border-white/6 px-3 pb-2.5 text-left text-ink-faint"
                        >
                          {heading}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {orderedSubmissions.map((sub, i) => (
                    <tr key={sub.id || i}>
                      <td className="px-3 py-2 font-mono text-[0.72rem] text-ink-faint">
                        {formatClockTime(sub.timeSubmitted)}
                      </td>
                      <td className="px-3 py-2 text-[0.82rem] font-semibold text-ink">
                        {sub.user?.handle ?? "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-[0.78rem] text-ink-dim">
                        {sub.problem?.name ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <VerdictBadge verdict={sub.verdict} />
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 font-mono text-[0.72rem]",
                          sub.verdict === "OK" ? "text-success" : "text-ink-faint",
                        )}
                      >
                        {sub.verdict === "OK"
                          ? formatSolveTime(sub.solveTimeSeconds)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Stacked cards on phones — a 5-column table is unreadable there */}
            <div className="flex flex-col gap-2 sm:hidden">
              {orderedSubmissions.map((sub, i) => (
                <div
                  key={sub.id || i}
                  className="panel flex items-center justify-between gap-3 rounded-md px-3.5 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[0.85rem] font-bold text-ink">
                      {sub.user?.handle ?? "—"}
                    </p>
                    <p className="truncate text-[0.72rem] text-ink-faint">
                      {sub.problem?.name ?? "—"} ·{" "}
                      {formatClockTime(sub.timeSubmitted)}
                    </p>
                  </div>
                  <VerdictBadge verdict={sub.verdict} />
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
