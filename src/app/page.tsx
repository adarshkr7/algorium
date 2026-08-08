"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Clock,
  Radio,
  Shield,
  Swords,
  Target,
  Users,
  Zap,
} from "lucide-react";
import { useUser } from "@/context/UserContext";
import { cn } from "@/lib/cn";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  buttonStyles,
  Card,
  Divider,
  EmptyState,
  SectionTitle,
  Skeleton,
} from "@/components/ui";

interface PublicRoom {
  id: string;
  code: string;
  hostingType: string;
  createdAt: string;
  host: { handle: string; avatar: string; rating: number; elo: number };
  contest: {
    name: string;
    mode: string;
    problemCount: number;
    durationMinutes: number;
    minRating: number;
    maxRating: number;
  } | null;
  series: { bestOf: number } | null;
}

const MODES = [
  {
    icon: Zap,
    name: "Blitz",
    href: "/create?mode=BLITZ",
    blurb:
      "A linear race. Solve the current problem to lock it and unlock the next one for both players.",
  },
  {
    icon: Target,
    name: "Lockout",
    href: "/create?mode=LOCKOUT",
    blurb:
      "Every problem is open. The first accepted solution claims it permanently.",
  },
  {
    icon: Shield,
    name: "Classic",
    href: "/create?mode=CLASSIC",
    blurb:
      "Traditional ICPC scoring — most solved wins, with penalty time breaking ties.",
  },
];

export default function HomePage() {
  const { user } = useUser();
  const router = useRouter();

  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [rooms, setRooms] = useState<PublicRoom[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch("/api/rooms/public", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { rooms: PublicRoom[] };
        if (!cancelled) setRooms(data.rooms);
      } catch {
        if (!cancelled) setRooms([]);
      }
    };

    void load();
    const id = setInterval(load, 20_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const joinByCode = (e: React.FormEvent) => {
    e.preventDefault();
    const code = roomCode.trim().toUpperCase();
    if (!code) return;
    if (code.length !== 6) {
      setError("Room codes are exactly 6 characters.");
      return;
    }
    if (!user) {
      setError("Sign in with your Codeforces handle first.");
      return;
    }
    router.push(`/room/${code}`);
  };

  const joinPublic = (code: string) => {
    if (!user) {
      setError("Sign in with your Codeforces handle first.");
      return;
    }
    router.push(`/room/${code}`);
  };

  return (
    <div className="flex flex-col gap-14 sm:gap-20">
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="grid items-center gap-10 pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-16 lg:pt-10">
        <div className="animate-blur-reveal">
          <Badge tone="brand" className="mb-5">
            <Radio className="size-3" />
            Live 1v1 on Codeforces problems
          </Badge>

          <h1 className="text-display text-ink">
            Duel programmers
            <br />
            <span className="font-medium text-ink-faint">in real time</span>
          </h1>

          <p className="mt-5 max-w-lg text-base leading-relaxed text-ink-dim sm:text-lg">
            Pick a mode, share a code, and race an opponent through problems
            neither of you has solved. Verdicts land on the scoreboard the
            moment Codeforces judges them.
          </p>

          <form
            onSubmit={joinByCode}
            className="mt-8 flex max-w-md flex-col gap-3 sm:flex-row"
          >
            <input
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="ROOM CODE"
              value={roomCode}
              maxLength={6}
              onChange={(e) => {
                setRoomCode(e.target.value.toUpperCase());
                setError(null);
              }}
              className={cn(
                // `flex-1` only from sm up: the form stacks on mobile, where a
                // vertical main axis turns flex-basis:0 into a collapsed
                // *height* and squashes the field to its line box.
                "h-13 w-full min-w-0 sm:flex-1",
                "rounded-full border border-line-strong bg-elevated px-5",
                // 16px on mobile keeps iOS from zooming the page on focus.
                "text-center font-mono text-base tracking-[0.35em] text-ink sm:text-left sm:text-lg",
                "outline-none transition-colors duration-200",
                "placeholder:tracking-[0.2em] placeholder:text-ink-faint",
                "focus:border-ink-dim",
              )}
            />
            <Button type="submit" variant="primary" size="lg" className="shrink-0">
              Join duel
            </Button>
          </form>

          {error && (
            <Alert tone="warning" shake className="mt-4 max-w-md">
              {error}
            </Alert>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link
              href="/create"
              className={buttonStyles({ variant: "outline", size: "md" })}
            >
              Host a new duel
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/create?solo=1"
              className="text-sm font-semibold text-ink-dim no-underline transition-colors hover:text-ink"
            >
              or practise solo →
            </Link>
          </div>
        </div>

        {/* Mode cards */}
        <div className="stagger flex flex-col gap-3">
          {MODES.map((mode) => (
            <Link key={mode.name} href={mode.href} className="no-underline">
              <Card interactive padding="sm" className="flex items-start gap-3.5">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-white/5">
                  <mode.icon className="size-4 text-ink-dim" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-ink">{mode.name}</h2>
                  <p className="mt-1 text-[0.8rem] leading-relaxed text-ink-faint">
                    {mode.blurb}
                  </p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <Divider />

      {/* ── Open duels ────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-5">
        <SectionTitle
          icon={<Users className="size-4" />}
          action={
            <Link
              href="/create"
              className="text-xs font-bold text-ink-dim no-underline hover:text-ink"
            >
              Host one →
            </Link>
          }
        >
          Open duels
        </SectionTitle>

        {rooms === null ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-28 rounded-lg" />
            ))}
          </div>
        ) : rooms.length === 0 ? (
          <EmptyState
            icon={<Swords className="size-5" />}
            title="No open duels right now"
            message="Host a public room and it'll show up here for anyone to join — or share a code directly with a friend."
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
          <div className="grid gap-3 sm:grid-cols-2">
            {rooms.map((room) => (
              <Card
                key={room.id}
                padding="sm"
                className="flex flex-col gap-3.5"
              >
                <div className="flex items-start gap-3">
                  <Avatar
                    src={room.host.avatar}
                    alt={room.host.handle}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">
                      {room.contest?.name ?? "Duel"}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-ink-faint">
                      hosted by {room.host.handle} · {room.host.elo} Elo
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-xs font-bold tracking-widest text-brand">
                    {room.code}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="neutral">{room.contest?.mode}</Badge>
                  <Badge tone="neutral">
                    {room.contest?.problemCount} problems
                  </Badge>
                  <Badge tone="neutral" icon={<Clock className="size-3" />}>
                    {room.contest?.durationMinutes}m
                  </Badge>
                  <Badge tone="neutral">
                    {room.contest?.minRating}–{room.contest?.maxRating}
                  </Badge>
                  {room.series && room.series.bestOf > 1 && (
                    <Badge tone="warning">Best of {room.series.bestOf}</Badge>
                  )}
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  fullWidth
                  onClick={() => joinPublic(room.code)}
                >
                  Join
                </Button>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-5">
        <SectionTitle icon={<Swords className="size-4" />}>
          How a duel works
        </SectionTitle>
        <ol className="grid gap-3 sm:grid-cols-3">
          {[
            {
              step: "01",
              title: "Host or join",
              body: "Set the mode, problem count, rating band and duration — or drop into an open room.",
            },
            {
              step: "02",
              title: "Solve on Codeforces",
              body: "Problems open on Codeforces as normal. Submit there with your own handle.",
            },
            {
              step: "03",
              title: "Watch it land",
              body: "Verdicts are picked up automatically and pushed to both scoreboards live.",
            },
          ].map((item) => (
            <li key={item.step} className="panel rounded-lg p-5">
              <span className="font-mono text-xs font-bold text-ink-faint">
                {item.step}
              </span>
              <h3 className="mt-2 text-base font-bold text-ink">{item.title}</h3>
              <p className="mt-1.5 text-[0.82rem] leading-relaxed text-ink-faint">
                {item.body}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
