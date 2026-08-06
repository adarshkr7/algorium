"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Book,
  ChevronRight,
  Globe,
  RotateCcw,
  Shield,
  Swords,
  Target,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge, buttonStyles, Card, SectionTitle } from "@/components/ui";

const SECTIONS = [
  { id: "intro", label: "Getting started", icon: Book },
  { id: "modes", label: "Game modes", icon: Swords },
  { id: "scoring", label: "Scoring", icon: Zap },
  { id: "rooms", label: "Rooms & formats", icon: Users },
  { id: "series", label: "Series & rematches", icon: RotateCcw },
  { id: "ladder", label: "Elo ladder", icon: Trophy },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export default function DocsPage() {
  const [active, setActive] = useState<SectionId>("intro");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id as SectionId);
        }
      },
      { rootMargin: "-25% 0px -70% 0px" },
    );

    document
      .querySelectorAll("section[id]")
      .forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    window.scrollTo({
      top: el.getBoundingClientRect().top + window.scrollY - 96,
      behavior: "smooth",
    });
  };

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-12">
      {/* ── Section nav ───────────────────────────────────────────────────── */}
      {/* Horizontal scroller on mobile, sticky sidebar on desktop. */}
      <nav className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:sticky lg:top-24 lg:mx-0 lg:w-56 lg:shrink-0 lg:flex-col lg:overflow-visible lg:px-0">
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => scrollTo(section.id)}
            className={cn(
              "flex shrink-0 cursor-pointer items-center gap-2.5 rounded-full border-0 px-4 py-2.5 text-[0.83rem] font-semibold whitespace-nowrap transition-colors lg:w-full lg:justify-between lg:rounded-md",
              active === section.id
                ? "bg-white/8 text-ink"
                : "bg-transparent text-ink-dim hover:text-ink",
            )}
          >
            <span className="flex items-center gap-2.5">
              <section.icon className="size-4" />
              {section.label}
            </span>
            <ChevronRight
              className={cn(
                "hidden size-3.5 lg:block",
                active === section.id ? "opacity-100" : "opacity-0",
              )}
            />
          </button>
        ))}
      </nav>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col gap-12">
        <section id="intro" className="flex flex-col gap-4 scroll-mt-24">
          <h1 className="text-display-sm text-ink">How Algorium works</h1>
          <p className="text-base leading-relaxed text-ink-dim">
            Algorium turns Codeforces into a head-to-head game. You pick the
            rules, we pick problems neither player has solved, and the
            scoreboard updates itself by watching your public submissions.
          </p>

          <Card className="flex flex-col gap-4">
            <SectionTitle>The loop</SectionTitle>
            <ol className="flex flex-col gap-3 text-[0.9rem] leading-relaxed text-ink-dim">
              <li>
                <strong className="text-ink">1. Sign in.</strong> Prove you own
                your Codeforces handle by submitting deliberately broken code to
                an assigned problem. We look for the compilation error — only
                the real account owner can produce one.
              </li>
              <li>
                <strong className="text-ink">2. Host or join.</strong> Configure
                a room and share the 6-character code, or make it public and let
                anyone join from the home page.
              </li>
              <li>
                <strong className="text-ink">3. Solve on Codeforces.</strong>{" "}
                Problems open there as normal. Submit with your own account.
              </li>
              <li>
                <strong className="text-ink">4. Watch the board.</strong>{" "}
                Verdicts are picked up within seconds and pushed live to both
                players.
              </li>
            </ol>
          </Card>

          <Link
            href="/create"
            className={buttonStyles({ variant: "primary", className: "self-start" })}
          >
            Create your first duel
          </Link>
        </section>

        <section id="modes" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="text-2xl font-extrabold text-ink">Game modes</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <ModeCard
              icon={Target}
              name="Lockout"
              summary="Every problem is open from the start. The first accepted solution claims that problem permanently — your opponent can no longer score it."
              best="Best for: a broad race where you can cherry-pick what you're good at."
            />
            <ModeCard
              icon={Zap}
              name="Blitz"
              summary="A strictly linear race. Only the current problem is available; solving it locks it and opens the next one for both players."
              best="Best for: fast, tense games where speed matters more than breadth."
            />
            <ModeCard
              icon={Shield}
              name="Classic"
              summary="Both players can solve everything. Most problems solved wins, with penalty time breaking ties — standard ICPC rules."
              best="Best for: a fair test of total output over the full duration."
            />
          </div>
        </section>

        <section id="scoring" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="text-2xl font-extrabold text-ink">Scoring</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card className="flex flex-col gap-3">
              <Badge tone="neutral">ICPC</Badge>
              <p className="text-[0.9rem] leading-relaxed text-ink-dim">
                Your score is the number of problems solved. Penalty time is the
                minutes elapsed at each solve, plus 20 minutes for every wrong
                submission that came before it. Lower penalty wins ties.
              </p>
            </Card>
            <Card className="flex flex-col gap-3">
              <Badge tone="success">Points</Badge>
              <p className="text-[0.9rem] leading-relaxed text-ink-dim">
                Problems are worth 100, 200, 300… by position, so the harder
                later problems are worth chasing. Penalty time still breaks
                ties.
              </p>
            </Card>
          </div>
          <Card>
            <p className="text-[0.9rem] leading-relaxed text-ink-dim">
              <strong className="text-ink">Tie-breaks</strong>, in order:
              primary score, then total penalty, then whoever finished their
              last accepted solution earliest. If everything ties, it&apos;s a
              draw.
            </p>
          </Card>
        </section>

        <section id="rooms" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="text-2xl font-extrabold text-ink">Rooms & formats</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="flex flex-col gap-2.5">
              <Swords className="size-5 text-ink-dim" />
              <h3 className="font-bold text-ink">Play</h3>
              <p className="text-[0.85rem] leading-relaxed text-ink-faint">
                You host and compete. The first person to join is your opponent.
              </p>
            </Card>
            <Card className="flex flex-col gap-2.5">
              <Users className="size-5 text-ink-dim" />
              <h3 className="font-bold text-ink">Supervise</h3>
              <p className="text-[0.85rem] leading-relaxed text-ink-faint">
                You host but don&apos;t play. The first two people to join are
                the contestants — useful for club matches.
              </p>
            </Card>
            <Card className="flex flex-col gap-2.5">
              <Target className="size-5 text-ink-dim" />
              <h3 className="font-bold text-ink">Practice</h3>
              <p className="text-[0.85rem] leading-relaxed text-ink-faint">
                A solo timed run against the clock. Nothing is rated and no
                match history is recorded.
              </p>
            </Card>
          </div>
          <Card className="flex items-start gap-3">
            <Globe className="mt-0.5 size-4 shrink-0 text-ink-faint" />
            <p className="text-[0.9rem] leading-relaxed text-ink-dim">
              Toggle <strong className="text-ink">list in open duels</strong> to
              publish your room on the home page so strangers can join. Leave it
              off and only people with the code can get in.
            </p>
          </Card>
        </section>

        <section id="series" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="text-2xl font-extrabold text-ink">
            Series & rematches
          </h2>
          <Card className="flex flex-col gap-3">
            <p className="text-[0.9rem] leading-relaxed text-ink-dim">
              When you host, you can make it a{" "}
              <strong className="text-ink">best of 3 or 5</strong>. Each game is
              its own room with a fresh problem set; the series score follows
              you across them and the first player to take the majority wins it.
            </p>
            <p className="text-[0.9rem] leading-relaxed text-ink-dim">
              After any duel, either player can hit{" "}
              <strong className="text-ink">Rematch</strong>. That creates a new
              room with identical settings and new problems, and sends the other
              player an invite. Inside a series, Rematch becomes{" "}
              <strong className="text-ink">Play next game</strong>.
            </p>
          </Card>
        </section>

        <section id="ladder" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="text-2xl font-extrabold text-ink">Elo ladder</h2>
          <Card className="flex flex-col gap-3">
            <p className="text-[0.9rem] leading-relaxed text-ink-dim">
              Every rated duel moves your Algorium Elo. It starts at{" "}
              <strong className="text-ink">1200</strong> and is completely
              separate from your Codeforces rating — beating someone stronger
              than you is worth more than beating someone weaker.
            </p>
            <p className="text-[0.9rem] leading-relaxed text-ink-dim">
              Your first ten duels are provisional and move the number faster
              while it finds your level. Resigning counts as a loss. Solo
              practice never affects it.
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Badge tone="danger">Grandmaster 2200+</Badge>
              <Badge tone="warning">Master 1900+</Badge>
              <Badge tone="info">Expert 1600+</Badge>
              <Badge tone="success">Specialist 1400+</Badge>
              <Badge tone="neutral">Challenger 1200+</Badge>
            </div>
          </Card>
          <Link
            href="/standings"
            className={buttonStyles({
              variant: "secondary",
              className: "self-start",
            })}
          >
            View the standings
          </Link>
        </section>
      </div>
    </div>
  );
}

function ModeCard({
  icon: Icon,
  name,
  summary,
  best,
}: {
  icon: React.ElementType;
  name: string;
  summary: string;
  best: string;
}) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <Icon className="size-5 text-ink-dim" />
        <h3 className="text-lg font-bold text-ink">{name}</h3>
      </div>
      <p className="text-[0.88rem] leading-relaxed text-ink-dim">{summary}</p>
      <p className="text-[0.78rem] leading-relaxed text-ink-faint">{best}</p>
    </Card>
  );
}
