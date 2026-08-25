"use client";

import React, { use, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  Clock,
  Eye,
  LogOut,
  Shield,
  Swords,
  Trophy,
  Video,
  VideoOff,
  Zap,
} from "lucide-react";
import { useUser } from "@/context/UserContext";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { formatCountdown } from "@/lib/format";
import {
  Alert,
  Badge,
  Button,
  buttonStyles,
  ConfirmDialog,
  ErrorScreen,
  LoadingScreen,
  Modal,
  useToast,
} from "@/components/ui";
import { useArena } from "@/components/arena/useArena";
import {
  ProblemPanel,
  ProblemPills,
  type ProblemStatus,
} from "@/components/arena/ProblemPanel";
import { ActivityFeed, Scoreboard } from "@/components/arena/Scoreboard";
import { ResultsScreen } from "@/components/arena/ResultsScreen";
import { MediaRail } from "@/components/arena/MediaRail";
import { useMedia } from "@/components/arena/useMedia";
import type { ArenaProblem } from "@/components/arena/types";

type MobileTab = "problem" | "board" | "feed" | "video";

const TABS: { id: MobileTab; label: string; icon: React.ElementType }[] = [
  { id: "problem", label: "Problem", icon: Swords },
  { id: "board", label: "Score", icon: Trophy },
  { id: "feed", label: "Activity", icon: Activity },
];

const VIDEO_TAB: { id: MobileTab; label: string; icon: React.ElementType } = {
  id: "video",
  label: "Video",
  icon: Video,
};

export default function ArenaPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = use(params);
  const code = rawCode.toUpperCase();

  const router = useRouter();
  const toast = useToast();
  const { user } = useUser();
  const arena = useArena(code);

  const [tab, setTab] = useState<MobileTab>("problem");
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [quitting, setQuitting] = useState(false);

  const {
    room,
    contest,
    problems,
    submissions,
    standings,
    player1,
    player2,
    isSupervised,
    isSupervisor,
    remainingSeconds,
    isFinished,
    winnerInfo,
    rematchInvite,
    dismissRematchInvite,
    blitzCountdown,
    selectedIndex,
    setSelectedIndex,
    loadError,
  } = arena;

  const isContestant = Boolean(
    user && (user.id === player1?.id || user.id === player2?.id),
  );

  const media = useMedia({
    code,
    contestId: contest?.id ?? null,
    requireVideo: contest?.requireVideo ?? false,
    requireAudio: contest?.requireAudio ?? false,
    graceSeconds: contest?.mediaGraceSeconds ?? 30,
    userId: user?.id ?? null,
    isContestant,
    isFinished,
  });

  const activeBlitzIndex = useMemo(
    () =>
      contest?.mode === "BLITZ"
        ? problems.findIndex((p) => !p.lockedWinnerId)
        : -1,
    [contest?.mode, problems],
  );

  const statusOf = useCallback(
    (problem: ArenaProblem, index: number): ProblemStatus => {
      const lockedAhead =
        contest?.mode === "BLITZ" &&
        activeBlitzIndex !== -1 &&
        index > activeBlitzIndex;

      const claimed =
        (contest?.mode === "LOCKOUT" || contest?.mode === "BLITZ") &&
        problem.lockedWinnerId != null;

      const lockedBy =
        problem.lockedWinnerId === player1?.id
          ? player1
          : problem.lockedWinnerId === player2?.id
            ? player2
            : null;

      const mine = submissions.some(
        (s) =>
          user &&
          s.userId === user.id &&
          s.problemId === problem.id &&
          s.verdict === "OK",
      );
      const theirs = submissions.some(
        (s) =>
          user &&
          s.userId !== user.id &&
          s.problemId === problem.id &&
          s.verdict === "OK",
      );

      return {
        isLocked: Boolean(claimed || lockedAhead),
        lockedAhead: Boolean(lockedAhead && !claimed),
        lockedBy,
        solvedByMe: mine,
        solvedByOpponent: theirs,
      };
    },
    [contest?.mode, activeBlitzIndex, player1, player2, submissions, user],
  );

  async function quitContest() {
    setQuitting(true);
    try {
      await apiFetch(`/api/rooms/${code}/leave`, { method: "POST", body: {} });
      toast.push("You resigned. You can still watch the rest.", "warning");
    } catch (err) {
      toast.push(errorMessage(err, "Couldn't resign."), "danger");
    } finally {
      setQuitting(false);
      setConfirmQuit(false);
    }
  }

  // ── Loading / error ──────────────────────────────────────────────────────
  if (loadError) {
    return (
      <ErrorScreen
        title={loadError}
        message="Check the room code, or head home to start a new duel."
      />
    );
  }

  if (!room || !contest) {
    return (
      <LoadingScreen
        icon={<Swords className="size-6" />}
        message="Entering the arena…"
      />
    );
  }

  // ── Finished ─────────────────────────────────────────────────────────────
  if (isFinished) {
    const isPlayer = Boolean(
      user && (user.id === player1?.id || user.id === player2?.id),
    );

    return (
      <>
        <ResultsScreen
          code={code}
          contest={contest}
          problems={problems}
          submissions={submissions}
          standings={standings}
          player1={player1}
          player2={player2}
          winnerInfo={winnerInfo}
          series={winnerInfo?.series ?? room.series}
          currentUserId={user?.id}
          canRematch={isPlayer && !contest.isSolo}
        />

        <Modal
          open={Boolean(rematchInvite)}
          onClose={dismissRematchInvite}
          title="Rematch ready"
          icon={<Swords className="size-5" />}
          description={`${rematchInvite?.createdByHandle} wants to go again`}
          footer={
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={dismissRematchInvite}>
                Not now
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  const target = rematchInvite?.code;
                  dismissRematchInvite();
                  if (target) router.push(`/room/${target}`);
                }}
              >
                Join room {rematchInvite?.code}
              </Button>
            </div>
          }
        >
          <p className="text-sm leading-relaxed text-ink-dim">
            A fresh room is waiting with the same settings and a brand new
            problem set.
          </p>
        </Modal>
      </>
    );
  }

  // ── Live ─────────────────────────────────────────────────────────────────
  const isBlitzLike = contest.mode === "BLITZ" || contest.mode === "LOCKOUT";
  const lowTime = remainingSeconds < 300;
  const selectedProblem = problems[selectedIndex] ?? problems[0];

  const scoreboard = (
    <Scoreboard
      contest={contest}
      standings={standings}
      player1={player1}
      player2={player2}
      currentUserId={user?.id}
      isSolo={contest.isSolo}
    />
  );

  const feed = (
    <ActivityFeed submissions={submissions} currentUserId={user?.id} />
  );

  // Reading the problems with your camera off is the thing the requirement
  // exists to prevent, so non-compliance costs you the problem panel
  // immediately rather than only at the end of the grace period. This is a
  // deterrent, not a security control — the server enforces the real rule.
  const problemArea = (
    <div className="relative flex flex-col gap-4">
      {media.inViolation && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-lg bg-canvas/80 px-6 text-center backdrop-blur-md">
          <VideoOff className="size-8 text-danger" />
          <p className="text-sm font-bold text-ink">
            Turn your{" "}
            {[
              contest.requireVideo && !media.myVideoOn && "camera",
              contest.requireAudio && !media.myAudioOn && "microphone",
            ]
              .filter(Boolean)
              .join(" and ")}{" "}
            back on
          </p>
          <p className="max-w-xs text-xs leading-relaxed text-ink-dim">
            {contest.mediaViolationAction === "FORFEIT"
              ? "The problems are hidden until it is. You forfeit if it stays off."
              : "The problems are hidden until it is. Your opponent and the log both see this."}
          </p>
          {media.graceRemaining !== null && (
            <p className="font-mono text-3xl font-extrabold tabular-nums text-danger">
              {media.graceRemaining}s
            </p>
          )}
        </div>
      )}
      <ProblemPills
        problems={problems}
        selectedIndex={selectedIndex}
        activeBlitzIndex={activeBlitzIndex}
        onSelect={setSelectedIndex}
        statusOf={statusOf}
      />
      <ProblemPanel
        problem={selectedProblem}
        index={selectedIndex}
        status={
          selectedProblem
            ? statusOf(selectedProblem, selectedIndex)
            : {
                isLocked: false,
                lockedAhead: false,
                lockedBy: null,
                solvedByMe: false,
                solvedByOpponent: false,
              }
        }
        pointingSystem={contest.pointingSystem}
        isSupervisor={isSupervisor}
        myHandle={user?.handle}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-4 border-b border-white/6 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3.5">
          <span
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-full",
              isBlitzLike ? "bg-brand/12" : "bg-white/5",
            )}
          >
            {isBlitzLike ? (
              <Zap className="size-5 text-brand-bright" />
            ) : (
              <Shield className="size-5 text-ink" />
            )}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
                {contest.name}
              </h1>
              <Badge tone={isBlitzLike ? "brand" : "neutral"}>
                {contest.mode}
              </Badge>
              {isSupervised && <Badge tone="warning">Supervised</Badge>}
              {contest.isSolo && <Badge tone="info">Practice</Badge>}
              {room.series && room.series.bestOf > 1 && (
                <Badge tone="warning">
                  Game {room.gameNumber} of {room.series.bestOf}
                </Badge>
              )}
            </div>
            <p className="mt-1 font-mono text-[0.78rem] text-ink-faint">
              Room <span className="font-bold text-brand">{code}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 lg:justify-end">
          <div
            className={cn(
              "flex items-center gap-3 rounded-full border px-4 py-2.5",
              lowTime
                ? "border-danger/30 bg-danger/8"
                : "border-white/8 bg-white/2",
            )}
          >
            <Clock
              className={cn(
                "size-4 shrink-0",
                lowTime ? "text-danger" : "text-ink-dim",
              )}
            />
            <div>
              <p className="text-[0.6rem] font-bold tracking-[0.12em] text-ink-faint uppercase">
                Remaining
              </p>
              <p
                className={cn(
                  "font-mono text-xl leading-none font-extrabold tabular-nums",
                  lowTime ? "text-danger" : "text-ink",
                )}
              >
                {formatCountdown(remainingSeconds)}
              </p>
            </div>
          </div>

          <Button
            variant="danger"
            onClick={() => setConfirmQuit(true)}
            icon={<LogOut className="size-4" />}
          >
            <span className="hidden xs:inline">
              {contest.isSolo ? "End practice" : "Resign"}
            </span>
          </Button>
        </div>
      </header>

      {isSupervisor && (
        <Alert tone="warning">
          <span className="flex items-center gap-2">
            <Eye className="size-4 shrink-0" />
            You&apos;re supervising {player1?.handle ?? "Player 1"} vs{" "}
            {player2?.handle ?? "Player 2"}.
          </span>
        </Alert>
      )}

      {blitzCountdown !== null && (
        <Alert tone="warning" shake>
          Next problem unlocks in {blitzCountdown}s…
        </Alert>
      )}

      {media.lastViolation && (
        <Alert tone="danger" shake>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              {media.lastViolation.isMe
                ? "Your"
                : `${media.lastViolation.handle}'s`}{" "}
              {media.lastViolation.missing.join(" and ")}{" "}
              {media.lastViolation.missing.length > 1 ? "were" : "was"} off past
              the grace period.
              {media.lastViolation.action === "FORFEIT"
                ? " The duel was forfeited."
                : " It has been logged."}
            </span>
            <button
              type="button"
              onClick={media.dismissViolation}
              className="cursor-pointer text-[0.72rem] font-bold tracking-wide text-ink-dim underline underline-offset-2 hover:text-ink"
            >
              Dismiss
            </button>
          </span>
        </Alert>
      )}

      {/* ── Mobile tabs ───────────────────────────────────────────────────── */}
      <div
        className={cn(
          "panel grid gap-1 rounded-full p-1 lg:hidden",
          media.enabled ? "grid-cols-4" : "grid-cols-3",
        )}
      >
        {(media.enabled ? [...TABS, VIDEO_TAB] : TABS).map(
          ({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "flex cursor-pointer items-center justify-center gap-1.5 rounded-full border-0 py-2.5 text-[0.78rem] font-bold transition-colors",
                tab === id
                  ? "bg-ink text-ink-invert"
                  : "bg-transparent text-ink-dim",
                // A red dot beats a label nobody is looking at when the reason
                // the problems just vanished is on another tab.
                id === "video" && media.inViolation && "text-danger",
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ),
        )}
      </div>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      {/* Desktop: two columns. Mobile: whichever tab is selected. */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className={cn(tab === "problem" ? "block" : "hidden", "lg:block")}>
          {problemArea}
        </div>

        <div className="flex flex-col gap-5">
          {media.enabled && (
            <div
              className={cn(tab === "video" ? "block" : "hidden", "lg:block")}
            >
              <MediaRail
                media={media}
                requireVideo={contest.requireVideo}
                requireAudio={contest.requireAudio}
              />
            </div>
          )}
          <div className={cn(tab === "board" ? "block" : "hidden", "lg:block")}>
            {scoreboard}
          </div>
          <div className={cn(tab === "feed" ? "block" : "hidden", "lg:block")}>
            {feed}
          </div>
        </div>
      </div>

      <div className="flex justify-center pt-2">
        <Link
          href="/"
          className={buttonStyles({ variant: "ghost", size: "sm" })}
        >
          Leave the arena (keeps your place)
        </Link>
      </div>

      <ConfirmDialog
        open={confirmQuit}
        title={contest.isSolo ? "End this practice run?" : "Resign the duel?"}
        message={
          contest.isSolo
            ? "The run will be closed. Your progress is kept but nothing is rated."
            : "Your opponent is awarded the win, and the loss is recorded against your Elo. You can still watch until the timer ends."
        }
        confirmLabel={contest.isSolo ? "End run" : "Resign"}
        loading={quitting}
        onConfirm={quitContest}
        onCancel={() => setConfirmQuit(false)}
      />
    </div>
  );
}
