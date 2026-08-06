"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ExternalLink,
  Flame,
  KeyRound,
  Swords,
  TrendingUp,
} from "lucide-react";
import { useUser } from "@/context/UserContext";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { eloTier } from "@/lib/elo";
import { formatDate, formatDuration, formatEloDelta } from "@/lib/format";
import {
  Avatar,
  Badge,
  buttonStyles,
  Card,
  EmptyState,
  ErrorScreen,
  LoadingScreen,
  SectionTitle,
  Stat,
} from "@/components/ui";

interface ProfileUser {
  id: string;
  handle: string;
  avatar: string;
  rating: number;
  maxRating: number;
  rank: string;
  maxRank: string;
  elo: number;
  peakElo: number;
  createdAt: string;
}

interface ProfileStats {
  totalMatches: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  elo: number;
  peakElo: number;
  eloTier: string;
  isProvisional: boolean;
  currentStreak: number;
  bestStreak: number;
  ladderRank: number | null;
}

interface MatchRow {
  id: string;
  roomCode: string;
  opponentHandle: string;
  mode: string;
  result: "WIN" | "LOSS" | "DRAW";
  userScore: number;
  opponentScore: number;
  duration: number;
  playedAt: string;
  eloChange: number;
  eloAfter: number;
}

export default function ProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle: rawHandle } = use(params);
  const handle = decodeURIComponent(rawHandle);
  const { user: currentUser } = useUser();

  const [data, setData] = useState<{
    user: ProfileUser;
    stats: ProfileStats;
    matchHistory: MatchRow[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const result = await apiFetch<typeof data>(
          `/api/profile/${encodeURIComponent(handle)}`,
        );
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, "Profile not found."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [handle]);

  if (loading) {
    return (
      <LoadingScreen
        icon={<Swords className="size-6" />}
        message={`Loading ${handle}…`}
      />
    );
  }

  if (error || !data) {
    return (
      <ErrorScreen
        title={error ?? "Profile not found"}
        message="That handle doesn't exist on Codeforces, or we couldn't reach the API."
      />
    );
  }

  const { user, stats, matchHistory } = data;
  const tier = eloTier(stats.elo);
  const isMe = currentUser?.handle === user.handle;

  return (
    <div className="stagger flex flex-col gap-7">
      {/* ── Banner ────────────────────────────────────────────────────────── */}
      <Card padding="lg" className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-7">
          <Avatar src={user.avatar} alt={user.handle} size="xl" />

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-display-sm truncate text-ink">
                {user.handle}
              </h1>
              <Badge tone="neutral">{user.rank}</Badge>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[0.82rem] text-ink-faint">
              <span className="flex items-center gap-1.5">
                <TrendingUp className="size-3.5" />
                <strong className={cn("font-bold", tier.className)}>
                  {stats.elo} Elo
                </strong>
                <span>({tier.name})</span>
              </span>
              <span>
                Peak <strong className="text-ink">{stats.peakElo}</strong>
              </span>
              <span>
                CF <strong className="text-ink">{user.rating || "unrated"}</strong>
              </span>
              {stats.ladderRank && (
                <span>
                  Ladder <strong className="text-ink">#{stats.ladderRank}</strong>
                </span>
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {stats.isProvisional && stats.totalMatches > 0 && (
                <Badge tone="info">
                  Provisional — {10 - stats.totalMatches} duels to settle
                </Badge>
              )}
              {stats.currentStreak >= 2 && (
                <Badge tone="warning" icon={<Flame className="size-3" />}>
                  {stats.currentStreak} win streak
                </Badge>
              )}
              {stats.bestStreak >= 3 && (
                <Badge tone="neutral">Best streak {stats.bestStreak}</Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <a
            href={`https://codeforces.com/profile/${user.handle}`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonStyles({ variant: "outline", size: "sm" })}
          >
            <ExternalLink className="size-3.5" />
            Codeforces
          </a>
          {isMe && (
            <Link
              href="/change-pass"
              className={buttonStyles({ variant: "primary", size: "sm" })}
            >
              <KeyRound className="size-3.5" />
              Change password
            </Link>
          )}
        </div>
      </Card>

      {/* ── Stats ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Duels" value={stats.totalMatches} />
        <Stat label="Wins" value={stats.wins} tone="success" />
        <Stat label="Losses" value={stats.losses} tone="danger" />
        <Stat label="Win rate" value={`${stats.winRate}%`} tone="brand" />
      </div>

      {/* ── Match history ─────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <SectionTitle icon={<Swords className="size-4" />}>
          Recent duels
        </SectionTitle>

        {matchHistory.length === 0 ? (
          <EmptyState
            icon={<Swords className="size-5" />}
            title="No duels yet"
            message="Host or join a room to start building a record."
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
          <div className="flex flex-col gap-2">
            {matchHistory.map((match) => (
              <Card
                key={match.id}
                padding="sm"
                className="flex flex-wrap items-center gap-x-4 gap-y-3"
              >
                <span
                  className={cn(
                    "w-16 shrink-0 rounded-md py-1.5 text-center text-[0.7rem] font-extrabold tracking-wide",
                    match.result === "WIN" && "bg-success/12 text-success",
                    match.result === "LOSS" && "bg-danger/12 text-danger",
                    match.result === "DRAW" && "bg-white/6 text-ink-faint",
                  )}
                >
                  {match.result}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.95rem] font-bold text-ink">
                    vs {match.opponentHandle}
                  </p>
                  <p className="text-eyebrow mt-1 flex flex-wrap gap-x-2 text-ink-faint">
                    <span>{match.mode}</span>
                    <span>·</span>
                    <span>{formatDate(match.playedAt)}</span>
                    <span>·</span>
                    <span>{formatDuration(match.duration)}</span>
                  </p>
                </div>

                <div className="shrink-0 text-right font-mono">
                  <p className="text-base font-extrabold text-ink">
                    {match.userScore}
                    <span className="mx-1.5 text-ink-faint">—</span>
                    {match.opponentScore}
                  </p>
                  {match.eloChange !== 0 && (
                    <p
                      className={cn(
                        "text-[0.7rem] font-bold",
                        match.eloChange > 0 ? "text-success" : "text-danger",
                      )}
                    >
                      {formatEloDelta(match.eloChange)} → {match.eloAfter}
                    </p>
                  )}
                </div>

                {match.roomCode && (
                  <Link
                    href={`/arena/${match.roomCode}`}
                    className={buttonStyles({
                      variant: "ghost",
                      size: "xs",
                      className: "shrink-0",
                    })}
                  >
                    Recap
                    <ArrowRight className="size-3" />
                  </Link>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
