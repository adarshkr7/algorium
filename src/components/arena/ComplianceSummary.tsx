"use client";

import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, ShieldAlert, Video } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { Card, SectionTitle } from "@/components/ui";
import type { ArenaPlayer } from "./types";

/**
 * What the cameras did, after the fact.
 *
 * Shown only for contests that required a device. The numbers come from the
 * append-only `MediaEvent` log rather than from the participants' final state,
 * because "was your camera on when the clock stopped" is a much weaker
 * question than "how long was it off in total".
 */

interface MediaEventRow {
  userId: string;
  kind: string;
  source: string;
  at: string;
}

interface PerPlayer {
  userId: string;
  offSeconds: number;
  incidents: number;
  warned: boolean;
  forfeited: boolean;
}

export function ComplianceSummary({
  code,
  requireVideo,
  requireAudio,
  player1,
  player2,
  contestEndedAt,
}: {
  code: string;
  requireVideo: boolean;
  requireAudio: boolean;
  player1: ArenaPlayer | null;
  player2: ArenaPlayer | null;
  contestEndedAt: string | null;
}) {
  const [events, setEvents] = useState<MediaEventRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  const enabled = requireVideo || requireAudio;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    void apiFetch<{ events: MediaEventRow[] }>(
      `/api/rooms/${code}/media/events`,
      { cache: "no-store" },
    )
      .then((data) => {
        if (!cancelled) setEvents(data.events);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [code, enabled]);

  const summary = useMemo(() => {
    if (!events) return null;
    // Falling back to the last logged event rather than the clock keeps this
    // pure, and is the better answer anyway: a device that was never turned
    // back on was off until the contest stopped, not until you opened the page.
    const lastEventAt = events.length
      ? new Date(events[events.length - 1].at).getTime()
      : 0;
    const end = contestEndedAt
      ? new Date(contestEndedAt).getTime()
      : lastEventAt;
    const perPlayer = new Map<string, PerPlayer>();

    const get = (userId: string): PerPlayer => {
      let row = perPlayer.get(userId);
      if (!row) {
        row = {
          userId,
          offSeconds: 0,
          incidents: 0,
          warned: false,
          forfeited: false,
        };
        perPlayer.set(userId, row);
      }
      return row;
    };

    // Pair each OFF with the next ON for the same device and person. An OFF
    // with no matching ON ran to the end of the contest.
    const openAt = new Map<string, number>();

    for (const event of events) {
      const row = get(event.userId);
      const at = new Date(event.at).getTime();

      if (event.kind === "WARNED") row.warned = true;
      if (event.kind === "FORFEITED") row.forfeited = true;

      const device =
        event.kind.startsWith("VIDEO") ? "video"
        : event.kind.startsWith("AUDIO") ? "audio"
        : null;
      if (!device) continue;

      const key = `${event.userId}:${device}`;
      if (event.kind.endsWith("_OFF")) {
        if (!openAt.has(key)) {
          openAt.set(key, at);
          row.incidents += 1;
        }
      } else {
        const start = openAt.get(key);
        if (start !== undefined) {
          row.offSeconds += Math.max(0, (at - start) / 1000);
          openAt.delete(key);
        }
      }
    }

    for (const [key, start] of openAt) {
      const userId = key.split(":")[0];
      get(userId).offSeconds += Math.max(0, (end - start) / 1000);
    }

    return perPlayer;
  }, [events, contestEndedAt]);

  if (!enabled) return null;

  const players = [player1, player2].filter(Boolean) as ArenaPlayer[];
  const needed = [requireVideo && "camera", requireAudio && "microphone"]
    .filter(Boolean)
    .join(" and ");

  return (
    <Card className="flex flex-col gap-4">
      <SectionTitle icon={<Video className="size-3.5" />}>
        Device compliance
      </SectionTitle>

      {failed ? (
        <p className="text-xs text-ink-faint">
          Couldn&apos;t load the compliance log.
        </p>
      ) : !summary ? (
        <p className="text-xs text-ink-faint">Loading…</p>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {players.map((player) => {
              const row = summary.get(player.id);
              const clean = !row || (row.offSeconds < 1 && row.incidents === 0);
              return (
                <div
                  key={player.id}
                  className="flex items-center justify-between gap-4 border-b border-white/6 pb-3 last:border-0 last:pb-0"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {clean ? (
                      <ShieldCheck className="size-4 shrink-0 text-success" />
                    ) : (
                      <ShieldAlert className="size-4 shrink-0 text-danger" />
                    )}
                    <span className="truncate text-sm font-bold text-ink">
                      {player.handle}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-right font-mono text-xs",
                      clean ? "text-ink-faint" : "text-danger",
                    )}
                  >
                    {clean
                      ? "No interruptions"
                      : `${formatDuration(row!.offSeconds)} off · ${row!.incidents} ${
                          row!.incidents === 1 ? "incident" : "incidents"
                        }${row!.forfeited ? " · forfeited" : row!.warned ? " · warned" : ""}`}
                  </span>
                </div>
              );
            })}
          </div>

          <p className="text-xs leading-relaxed text-ink-faint">
            This duel required a {needed}. The log records presence only — it is
            not evidence of how the problems were solved.
          </p>
        </>
      )}
    </Card>
  );
}

function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}
