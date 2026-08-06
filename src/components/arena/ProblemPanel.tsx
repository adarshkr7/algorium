"use client";

import { CheckCircle2, ExternalLink, Info, Lock } from "lucide-react";
import { cn } from "@/lib/cn";
import { codeforcesProblemUrl, problemLetter } from "@/lib/format";
import { problemPoints } from "@/lib/services/standings";
import { Badge, buttonStyles, Card, RatingBadge } from "@/components/ui";
import type { ArenaPlayer, ArenaProblem } from "./types";

export interface ProblemStatus {
  isLocked: boolean;
  lockedBy: ArenaPlayer | null;
  /** Locked because it's later in the Blitz queue, not because someone won it. */
  lockedAhead: boolean;
  solvedByMe: boolean;
  solvedByOpponent: boolean;
}

/** Horizontal problem selector. Scrolls and snaps on narrow screens. */
export function ProblemPills({
  problems,
  selectedIndex,
  activeBlitzIndex,
  onSelect,
  statusOf,
}: {
  problems: ArenaProblem[];
  selectedIndex: number;
  activeBlitzIndex: number;
  onSelect: (index: number) => void;
  statusOf: (problem: ArenaProblem, index: number) => ProblemStatus;
}) {
  return (
    <div className="panel snap-row no-scrollbar flex gap-2 overflow-x-auto rounded-lg p-2.5">
      {problems.map((problem, idx) => {
        const status = statusOf(problem, idx);
        const selected = idx === selectedIndex;
        const isNext = idx === activeBlitzIndex;

        return (
          <button
            key={problem.id ?? idx}
            type="button"
            onClick={() => onSelect(idx)}
            disabled={status.isLocked && !selected}
            aria-current={selected}
            className={cn(
              "flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-full border px-4 font-mono text-sm font-bold transition-colors",
              selected && "border-ink bg-ink text-ink-invert",
              !selected && isNext && "border-warning/50 bg-warning/10 text-warning",
              !selected && !isNext && "border-white/10 bg-transparent text-ink",
              status.isLocked && !selected && "cursor-not-allowed opacity-35",
            )}
          >
            <span>{problemLetter(idx)}</span>
            {status.isLocked ? (
              <Lock className="size-3" />
            ) : status.solvedByMe ? (
              <CheckCircle2
                className={cn("size-3", selected ? "" : "text-success")}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Detail card for the selected problem. */
export function ProblemPanel({
  problem,
  index,
  status,
  pointingSystem,
  isSupervisor,
  myHandle,
}: {
  problem: ArenaProblem | undefined;
  index: number;
  status: ProblemStatus;
  pointingSystem: string;
  isSupervisor: boolean;
  myHandle?: string;
}) {
  if (!problem) {
    return (
      <Card className="text-center text-sm text-ink-faint">
        No problem selected.
      </Card>
    );
  }

  const statusNode = (() => {
    if (status.isLocked && status.lockedAhead) {
      return (
        <Badge tone="neutral" icon={<Lock className="size-3" />}>
          Locked — solve the current problem first
        </Badge>
      );
    }
    if (status.isLocked) {
      return (
        <Badge tone="danger" icon={<Lock className="size-3" />}>
          Locked by {status.lockedBy?.handle ?? "opponent"}
        </Badge>
      );
    }
    if (isSupervisor) {
      return <Badge tone="neutral">Supervisor view</Badge>;
    }
    if (status.solvedByMe) {
      return (
        <Badge tone="success" icon={<CheckCircle2 className="size-3" />}>
          Solved by you
        </Badge>
      );
    }
    if (status.solvedByOpponent) {
      return <Badge tone="solid">Solved by your opponent</Badge>;
    }
    return <Badge tone="warning">Unsolved</Badge>;
  })();

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 border-b border-white/6 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-2xl font-extrabold text-ink-faint">
              {problemLetter(index)}
            </span>
            <h2 className="min-w-0 text-xl font-extrabold text-ink sm:text-2xl">
              {problem.name}
            </h2>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <RatingBadge rating={problem.rating} />
            {pointingSystem === "POINTS" && (
              <Badge tone="success">
                {problemPoints(problem.indexInContest ?? index)} pts
              </Badge>
            )}
            <Badge tone="neutral" className="font-mono">
              {problem.problemKey}
            </Badge>
            {(problem.tags ?? []).slice(0, 6).map((tag) => (
              <Badge key={tag} tone="neutral">
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        <a
          href={codeforcesProblemUrl(problem.problemKey)}
          target="_blank"
          rel="noreferrer"
          className={buttonStyles({
            variant: "primary",
            size: "md",
            className: "shrink-0 max-sm:w-full",
          })}
        >
          Open on Codeforces
          <ExternalLink className="size-4" />
        </a>
      </div>

      <div className="panel flex flex-wrap items-center justify-between gap-3 rounded-md px-4 py-3.5">
        <span className="text-eyebrow text-ink-faint">Status</span>
        {statusNode}
      </div>

      <div className="panel flex items-start gap-3 rounded-md px-4 py-3.5">
        <Info className="mt-0.5 size-4 shrink-0 text-ink-faint" />
        <p className="text-[0.82rem] leading-relaxed text-ink-dim">
          {isSupervisor ? (
            <>
              You&apos;re supervising. Contestants submit on Codeforces and
              results appear here automatically.
            </>
          ) : (
            <>
              Submit on Codeforces with your own handle
              {myHandle && (
                <>
                  {" "}
                  (<strong className="text-ink">{myHandle}</strong>)
                </>
              )}
              . Verdicts are detected within a few seconds — no need to paste
              anything back here.
            </>
          )}
        </p>
      </div>
    </Card>
  );
}
