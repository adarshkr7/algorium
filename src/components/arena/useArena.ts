"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { apiFetch } from "@/lib/api-client";
import { useUser } from "@/context/UserContext";
import { useToast } from "@/components/ui";
import { calculateStandings, determineWinner, type Standings } from "@/lib/services/standings";
import { problemLetter } from "@/lib/format";
import type {
  ArenaProblem,
  ArenaRoom,
  ArenaSubmission,
  RematchInvite,
  WinnerInfo,
} from "./types";

/**
 * Everything stateful about a live duel: initial load, Supabase realtime,
 * the countdown, and a polling fallback.
 *
 * The fallback matters — the arena previously relied entirely on the
 * background worker plus realtime. If the worker wasn't running (or a
 * broadcast was dropped) the page sat there frozen for the whole contest.
 * We now also poke `/evaluate` on an interval, which is idempotent.
 */

const RELOAD_BACKOFF_MS = 2_000;
const EVALUATE_INTERVAL_MS = 12_000;

interface EvaluateResponse {
  status: string;
  newSubmissions: boolean;
  standings: Standings | null;
  problems: ArenaProblem[];
  submissions: ArenaSubmission[];
  contestStatus?: string;
  winnerInfo: WinnerInfo | null;
}

export function useArena(code: string) {
  const router = useRouter();
  const toast = useToast();
  const { user, refresh: refreshUser } = useUser();
  const [supabase] = useState(() => createClient());

  const [room, setRoom] = useState<ArenaRoom | null>(null);
  const [problems, setProblems] = useState<ArenaProblem[]>([]);
  const [submissions, setSubmissions] = useState<ArenaSubmission[]>([]);
  const [standings, setStandings] = useState<Standings | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [winnerInfo, setWinnerInfo] = useState<WinnerInfo | null>(null);
  const [rematchInvite, setRematchInvite] = useState<RematchInvite | null>(null);
  const [blitzCountdown, setBlitzCountdown] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Read inside realtime callbacks without re-subscribing on every auth change.
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const contestIdRef = useRef<string | null>(null);
  const finishedRef = useRef(false);
  useEffect(() => {
    finishedRef.current = isFinished;
  }, [isFinished]);

  /**
   * `evaluate` is defined below but needed by the realtime subscription above
   * it. Holding it in a ref keeps the subscription from tearing down and
   * re-establishing every time the callback identity changes.
   */
  const evaluateRef = useRef<(() => Promise<void>) | null>(null);

  const mergeSubmission = useCallback((incoming: ArenaSubmission) => {
    setSubmissions((prev) => {
      const key = incoming.id || incoming.cfSubmissionId;
      const idx = prev.findIndex(
        (s) => (s.id || s.cfSubmissionId) === key,
      );
      if (idx === -1) return [...prev, incoming];
      const next = [...prev];
      next[idx] = { ...next[idx], ...incoming };
      return next;
    });
  }, []);

  const applyFinish = useCallback(
    (info: WinnerInfo) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      setIsFinished(true);
      setWinnerInfo(info);
      if (info.standings) setStandings(info.standings);
      // Elo moved — pull the fresh number into the navbar.
      void refreshUser();
    },
    [refreshUser],
  );

  // ── Initial load ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const load = async () => {
      try {
        const data = await apiFetch<{ room: ArenaRoom }>(`/api/rooms/${code}`, {
          cache: "no-store",
        });
        if (cancelled) return;

        const r = data.room;
        if (r.status === "CANCELLED") {
          router.replace("/");
          return;
        }
        if (!r.contest) {
          retry = setTimeout(load, RELOAD_BACKOFF_MS);
          return;
        }

        contestIdRef.current = r.contest.id;
        setRoom(r);
        setProblems(r.contest.problems ?? []);
        setSubmissions(r.contest.submissions ?? []);
        setLoadError(null);

        if (r.contest.status === "FINISHED") {
          finishedRef.current = true;
          setIsFinished(true);

          const p1 = (r.hostingType === "SUPERVISED" ? r.player1 : r.host) ?? null;
          const p2 = (r.hostingType === "SUPERVISED" ? r.player2 : r.guest) ?? null;
          const st = calculateStandings(r.contest, p1, p2);
          const winnerParticipant = r.contest.participants?.find((p) => p.isWinner);
          const wId =
            winnerParticipant?.userId ??
            (!r.contest.isSolo ? determineWinner(r.contest, st) : null);
          const wHandle =
            (wId === p1?.id ? p1?.handle : wId === p2?.id ? p2?.handle : null) ??
            null;
          const isDr = !r.contest.isSolo && !wId;

          setWinnerInfo({
            winnerId: wId,
            winnerHandle: wHandle,
            isDraw: isDr,
            reason: "all_solved",
            standings: st,
            eloChanges: {},
            series: r.series,
          });
        }

        if (r.contest.startTime) {
          const start = new Date(r.contest.startTime).getTime();
          const end = r.contest.endTime
            ? new Date(r.contest.endTime).getTime()
            : start + r.contest.durationMinutes * 60_000;
          setRemainingSeconds(Math.max(0, Math.floor((end - Date.now()) / 1000)));
        }
      } catch (error) {
        if (cancelled) return;
        const status = (error as { status?: number }).status;
        if (status === 404) {
          setLoadError("That room doesn't exist.");
          return;
        }
        // The room endpoint is authenticated; retrying won't produce a session.
        if (status === 401) {
          setLoadError("Sign in to view this contest.");
          return;
        }
        retry = setTimeout(load, RELOAD_BACKOFF_MS);
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
    };
  }, [code, router]);

  // ── Realtime ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase.channel(`room-${code}`);

    channel
      .on("broadcast", { event: "new-recent-action" }, ({ payload }) => {
        const item = payload as { type: string; action: ArenaSubmission };
        if (item.type !== "SUBMISSION") return;

        mergeSubmission(item.action);

        const sub = item.action;
        const me = userRef.current;
        const who = me && sub.userId === me.id ? "You" : sub.user?.handle ?? "Opponent";
        const problem = sub.problem?.name ?? "a problem";

        if (sub.verdict === "OK") {
          toast.push(`${who} solved ${problem}`, "success");
        } else if (sub.verdict === "TESTING") {
          toast.push(`${who} submitted on ${problem}`, "info");
        } else {
          toast.push(
            `${who}: ${sub.verdict.replace(/_/g, " ")} on ${problem}`,
            "warning",
          );
        }
      })
      .on("broadcast", { event: "problems-update" }, ({ payload }) => {
        setProblems((payload as { problems: ArenaProblem[] }).problems);
      })
      .on("broadcast", { event: "scoreboard-update" }, ({ payload }) => {
        setStandings((payload as { standings: Standings }).standings);
      })
      .on("broadcast", { event: "blitz-problem-locked" }, ({ payload }) => {
        const { winnerHandle } = payload as { winnerHandle: string };
        toast.push(`${winnerHandle} locked a problem`, "warning");
      })
      .on("broadcast", { event: "strict-blitz-problem-locked" }, ({ payload }) => {
        const { winnerHandle, nextIndex } = payload as {
          winnerHandle: string;
          nextIndex: number;
        };
        setProblems((prevProblems) => {
          const hasNext = nextIndex < prevProblems.length;
          if (hasNext) {
            toast.push(
              `${winnerHandle} locked it — problem ${problemLetter(nextIndex)} is next`,
              "warning",
            );
            setBlitzCountdown(3);
            const id = setInterval(() => {
              setBlitzCountdown((prev) => {
                if (prev === null || prev <= 1) {
                  clearInterval(id);
                  setSelectedIndex(nextIndex);
                  return null;
                }
                return prev - 1;
              });
            }, 1000);
          } else {
            toast.push(`${winnerHandle} locked the final problem!`, "warning");
          }
          return prevProblems;
        });
      })
      // The payload is deliberately ignored. Broadcasts arrive on a public
      // channel that anyone holding the publishable key can write to, so
      // rendering a result straight from one let a stranger declare a winner
      // in someone else's duel. Treat the event as "something changed" and go
      // ask the server, which checks membership and reads the real standings.
      .on("broadcast", { event: "contest-finished" }, () => {
        void evaluateRef.current?.();
      })
      .on("broadcast", { event: "rematch-ready" }, ({ payload }) => {
        const invite = payload as RematchInvite;
        const me = userRef.current;
        // Don't invite the person who pressed the button.
        if (me && invite.createdByHandle === me.handle) return;
        setRematchInvite(invite);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [code, supabase, toast, mergeSubmission]);

  // ── Countdown ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isFinished || remainingSeconds <= 0) return;
    const id = setInterval(() => {
      setRemainingSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [isFinished, remainingSeconds]);

  // ── Polling fallback ─────────────────────────────────────────────────────
  const evaluate = useCallback(async () => {
    const contestId = contestIdRef.current;
    if (!contestId || finishedRef.current || !userRef.current) return;

    try {
      const data = await apiFetch<EvaluateResponse>(
        `/api/contests/${contestId}/evaluate`,
        { method: "POST", body: {} },
      );

      if (data.problems?.length) setProblems(data.problems);
      if (data.submissions?.length) setSubmissions(data.submissions);
      if (data.standings) setStandings(data.standings);

      if (data.winnerInfo) {
        applyFinish(data.winnerInfo);
      } else if (data.contestStatus === "FINISHED") {
        setRoom((currentRoom) => {
          if (currentRoom?.contest) {
            const p1 =
              (currentRoom.hostingType === "SUPERVISED"
                ? currentRoom.player1
                : currentRoom.host) ?? null;
            const p2 =
              (currentRoom.hostingType === "SUPERVISED"
                ? currentRoom.player2
                : currentRoom.guest) ?? null;
            const st = data.standings ?? calculateStandings(currentRoom.contest, p1, p2);
            const winnerParticipant = currentRoom.contest.participants?.find(
              (p) => p.isWinner,
            );
            const wId =
              winnerParticipant?.userId ??
              (!currentRoom.contest.isSolo ? determineWinner(currentRoom.contest, st) : null);
            const wHandle =
              (wId === p1?.id ? p1?.handle : wId === p2?.id ? p2?.handle : null) ??
              null;
            applyFinish({
              winnerId: wId,
              winnerHandle: wHandle,
              isDraw: !currentRoom.contest.isSolo && !wId,
              standings: st,
            });
          }
          return currentRoom;
        });
      }
    } catch {
      // Silent: realtime is the primary channel, this is only a safety net.
    }
  }, [applyFinish]);

  useEffect(() => {
    evaluateRef.current = evaluate;
  }, [evaluate]);

  useEffect(() => {
    if (isFinished || !room?.contest || room.contest.status !== "IN_PROGRESS") {
      return;
    }
    void evaluate();
    const id = setInterval(() => void evaluate(), EVALUATE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [evaluate, isFinished, room?.contest]);

  // The timer hitting zero should settle the contest even if nothing else does.
  useEffect(() => {
    if (isFinished || remainingSeconds > 0 || !room?.contest?.startTime) return;
    void evaluate();
  }, [remainingSeconds, isFinished, evaluate, room?.contest?.startTime]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const isSupervised = room?.hostingType === "SUPERVISED";
  const player1 = (isSupervised ? room?.player1 : room?.host) ?? null;
  const player2 = (isSupervised ? room?.player2 : room?.guest) ?? null;

  // Standings are pushed over realtime, but compute locally as a fallback so
  // the scoreboard is never blank.
  //
  // `contest` is hoisted out rather than written as `room?.contest` in the
  // dependency list: the optional chain there reads as a different expression
  // from the `room.contest` inside, which stopped the React Compiler from
  // preserving this memo at all.
  const contest = room?.contest ?? null;
  const localStandings = useMemo(() => {
    if (!contest) return null;
    return calculateStandings(
      { ...contest, problems, submissions },
      player1,
      player2,
    );
  }, [contest, problems, submissions, player1, player2]);

  const effectiveStandings = standings ?? localStandings;

  return {
    room,
    contest: room?.contest ?? null,
    problems,
    submissions,
    standings: effectiveStandings,
    player1,
    player2,
    isSupervised,
    isSupervisor: Boolean(isSupervised && user && user.id === room?.hostId),
    remainingSeconds,
    isFinished,
    winnerInfo,
    rematchInvite,
    dismissRematchInvite: () => setRematchInvite(null),
    blitzCountdown,
    selectedIndex,
    setSelectedIndex,
    loadError,
    refetchNow: evaluate,
  };
}
