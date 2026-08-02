"use client";

import React, { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import confetti from "canvas-confetti";
import {
  Swords, Clock, Zap, Shield, ExternalLink, CheckCircle2, Lock,
  Trophy, AlertCircle, Activity, LogOut, Eye,
} from "lucide-react";
import { useUser } from "@/context/UserContext";
import { getSocket } from "@/lib/socket";

const DEFAULT_AVATAR = "https://codeforces.org/s/0/images/user-alt.png";

export default function ArenaPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = use(params);
  const code = rawCode.toUpperCase();
  const { user } = useUser();
  const router = useRouter();

  const [room, setRoom] = useState<any>(null);
  const [contest, setContest] = useState<any>(null);
  const [problems, setProblems] = useState<any[]>([]);
  const [selectedProblemIndex, setSelectedProblemIndex] = useState<number>(0);
  const [recentActions, setRecentActions] = useState<any[]>([]);
  const [standings, setStandings] = useState<any>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [isFinished, setIsFinished] = useState<boolean>(false);
  const [winnerInfo, setWinnerInfo] = useState<any>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [blitzUnlockCountdown, setBlitzUnlockCountdown] = useState<number | null>(null);

  useEffect(() => {
    async function loadArenaData() {
      try {
        const res = await fetch(`/api/rooms/${code}`);
        const data = await res.json();
        if (!res.ok || !data.room || !data.room.contest) { router.push("/"); return; }

        const rm = data.room;
        const ct = rm.contest;

        setRoom(rm);
        setContest(ct);
        setProblems(ct.problems || []);

        const initialActions = (ct.submissions || [])
          .slice()
          .reverse()
          .map((sub: any) => ({ type: "SUBMISSION", action: sub }));
        setRecentActions(initialActions);

        if (ct.status === "FINISHED") setIsFinished(true);

        if (ct.startTime) {
          const start = new Date(ct.startTime).getTime();
          const duration = ct.durationMinutes * 60 * 1000;
          const end = start + duration;
          const now = Date.now();
          setRemainingSeconds(Math.max(0, Math.floor((end - now) / 1000)));
        }

        const socket = getSocket();
        socket.emit("join-room", { roomCode: code, handle: user ? user.handle : "Guest", userId: user ? user.id : null });

        socket.on("new-recent-action", (item: any) => {
          setRecentActions((prev) => [item, ...prev]);
          if (item.type === "SUBMISSION") {
            const sub = item.action;
            const isMe = user && sub.userId === user.id;
            const solverName = isMe ? "You" : sub.user?.handle || "Opponent";
            if (sub.verdict === "OK") {
              setNotification(`🎉 ${solverName} solved ${sub.problem?.name || "a problem"}!`);
              setTimeout(() => setNotification(null), 5000);
            } else {
              setNotification(`⚠️ ${solverName} got ${sub.verdict} on ${sub.problem?.name}`);
              setTimeout(() => setNotification(null), 4000);
            }
          }
        });

        socket.on("problems-update", ({ problems: updatedProblems }: { problems: any[] }) => {
          setProblems(updatedProblems);
        });

        socket.on("scoreboard-update", ({ standings: st }: { standings: any }) => {
          setStandings(st);
        });

        socket.on("blitz-problem-locked", ({ winnerHandle, nextIndex }: any) => {
          setNotification(`⚡ ${winnerHandle} locked the current problem! Moving to Problem ${String.fromCharCode(65 + nextIndex)}...`);
          setBlitzUnlockCountdown(3);
          const interval = setInterval(() => {
            setBlitzUnlockCountdown((prev) => {
              if (prev === null || prev <= 1) {
                clearInterval(interval);
                setSelectedProblemIndex(nextIndex);
                return null;
              }
              return prev - 1;
            });
          }, 1000);
        });

        socket.on("contest-finished", (result: any) => {
          setIsFinished(true);
          setWinnerInfo(result);
          if (user && result.winnerId === user.id) {
            confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
          }
        });

        return () => {
          socket.off("new-recent-action");
          socket.off("problems-update");
          socket.off("scoreboard-update");
          socket.off("blitz-problem-locked");
          socket.off("contest-finished");
        };
      } catch (err) {
        console.error("Arena init error:", err);
      }
    }

    loadArenaData();
  }, [code, user, router]);

  useEffect(() => {
    if (isFinished || remainingSeconds <= 0) return;
    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsFinished(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isFinished, remainingSeconds]);

  const handleLeaveContest = async () => {
    if (!user) { router.push("/"); return; }
    try {
      const socket = getSocket();
      socket.emit("leave-room", { roomCode: code, handle: user.handle, userId: user.id });
      await fetch(`/api/rooms/${code}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
    } catch (e) {
      console.error("Error leaving contest:", e);
    } finally {
      router.push("/");
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  if (!room || !contest) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 16 }}>
        <div className="neu-icon animate-float" style={{ width: 64, height: 64, background: "linear-gradient(135deg, var(--accent), var(--accent-dark))", boxShadow: "var(--neu-shadow), 0 0 24px var(--accent-glow)" }}>
          <Swords style={{ width: 28, height: 28, color: "#fff" }} />
        </div>
        <p className="font-mono" style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>Entering Duel Arena...</p>
      </div>
    );
  }

  const isSupervised = room.hostingType === "SUPERVISED";
  const player1 = isSupervised ? room.player1 : room.host;
  const player2 = isSupervised ? room.player2 : room.guest;
  const isSupervisor = user && user.id === room.hostId && isSupervised;

  const selectedProblem = problems[selectedProblemIndex] || problems[0];

  const getProblemStatus = (prob: any) => {
    if (!prob) return { isLocked: false, lockedByPlayer1: false, lockedByPlayer2: false, myAC: false, oppAC: false };
    const isLocked = contest.mode === "BLITZ" && prob.lockedWinnerId != null;
    const lockedByPlayer1 = prob.lockedWinnerId === player1?.id;
    const lockedByPlayer2 = prob.lockedWinnerId === player2?.id;

    const myAC = user && recentActions.some(
      (act) => act.type === "SUBMISSION" && act.action.userId === user.id && act.action.problemId === prob.id && act.action.verdict === "OK"
    );
    const oppAC = user && recentActions.some(
      (act) => act.type === "SUBMISSION" && act.action.userId !== user.id && act.action.problemId === prob.id && act.action.verdict === "OK"
    );

    return { isLocked, lockedByPlayer1, lockedByPlayer2, myAC, oppAC };
  };

  const activeBlitzIndex = contest.mode === "BLITZ" ? problems.findIndex((p) => !p.lockedWinnerId) : -1;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Top Bar */}
      <div className="neu-card-lg animate-fade-in-up" style={{ padding: "20px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span className="neu-icon" style={{
            width: 44, height: 44,
            background: contest.mode === "BLITZ" ? "linear-gradient(135deg, var(--success), #16a34a)" : "linear-gradient(135deg, var(--accent), var(--accent-dark))",
            boxShadow: contest.mode === "BLITZ" ? "0 0 16px rgba(34,197,94,0.3)" : "0 0 16px var(--accent-glow)",
          }}>
            {contest.mode === "BLITZ" ? <Zap style={{ width: 20, height: 20, color: "#fff" }} /> : <Shield style={{ width: 20, height: 20, color: "#fff" }} />}
          </span>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h1 style={{ fontWeight: 800, fontSize: "1.2rem", color: "var(--text-primary)", margin: 0 }}>{contest.name}</h1>
              <span className="neu-chip" style={{ background: contest.mode === "BLITZ" ? "var(--success)" : "var(--accent)", color: "#fff" }}>
                {contest.mode}
              </span>
              {isSupervised && (
                <span className="neu-chip" style={{ background: "var(--warning)", color: "#fff" }}>
                  SUPERVISED
                </span>
              )}
            </div>
            <p className="font-mono" style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "2px 0 0" }}>Room: {code}</p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          {/* Timer */}
          <div className="neu-inset" style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", borderRadius: "var(--r-md)" }}>
            <Clock style={{ width: 18, height: 18, color: remainingSeconds < 300 ? "var(--danger)" : "var(--accent)" }} />
            <div>
              <div className="neu-label" style={{ marginBottom: 2 }}>Remaining</div>
              <div className="font-mono" style={{ fontSize: "1.2rem", fontWeight: 800, color: remainingSeconds < 300 ? "var(--danger)" : "var(--text-primary)", letterSpacing: "0.08em" }}>
                {formatTime(remainingSeconds)}
              </div>
            </div>
          </div>

          <button onClick={handleLeaveContest} className="neu-btn-danger neu-btn" style={{ padding: "10px 16px", fontSize: "0.8rem" }}>
            <LogOut style={{ width: 14, height: 14 }} /> Leave
          </button>
        </div>
      </div>

      {/* Supervisor banner if supervisor */}
      {isSupervisor && (
        <div className="neu-card animate-fade-in-up" style={{ padding: "14px 20px", background: "var(--warning-soft)", boxShadow: "var(--neu-shadow-sm)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.85rem", fontWeight: 700, color: "var(--warning)" }}>
            <Eye style={{ width: 16, height: 16 }} />
            <span>👁️ You are Supervising this match between {player1?.handle || "Player 1"} and {player2?.handle || "Player 2"}.</span>
          </div>
        </div>
      )}

      {/* Live Notifications */}
      {notification && (
        <div className="neu-card animate-fade-in-up" style={{ padding: "14px 20px", background: "var(--accent-glow)", boxShadow: "var(--neu-shadow-sm)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.85rem", fontWeight: 700, color: "var(--accent)" }}>
            <Activity style={{ width: 16, height: 16 }} />
            <span>{notification}</span>
          </div>
        </div>
      )}

      {blitzUnlockCountdown !== null && (
        <div className="neu-card animate-shake" style={{ padding: "16px", background: "var(--warning-soft)", textAlign: "center", fontWeight: 700, color: "var(--warning)", fontSize: "0.9rem" }}>
          ⚡ Next problem unlocks in {blitzUnlockCountdown}s...
        </div>
      )}

      {/* Responsive Main Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24 }}>
        {/* Left Column: Problem Tabs & Active Problem */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Tabs */}
          <div className="neu-card" style={{ padding: "12px 16px", display: "flex", gap: 10, overflowX: "auto" }}>
            {problems.map((prob, idx) => {
              const status = getProblemStatus(prob);
              const isSelected = idx === selectedProblemIndex;
              const isActive = contest.mode === "BLITZ" && idx === activeBlitzIndex;

              return (
                <button
                  key={prob.id || idx}
                  onClick={() => setSelectedProblemIndex(idx)}
                  className="neu-btn font-mono"
                  style={{
                    padding: "8px 16px",
                    borderRadius: "var(--r-md)",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    ...(isSelected
                      ? { background: "linear-gradient(135deg, var(--accent), var(--accent-dark))", color: "#fff", boxShadow: "0 0 14px var(--accent-glow)" }
                      : status.isLocked
                      ? { opacity: 0.5, boxShadow: "var(--neu-inset-sm)" }
                      : isActive
                      ? { background: "var(--warning-soft)", color: "var(--warning)", boxShadow: "0 0 10px rgba(245,158,11,0.3)" }
                      : {}
                    ),
                  }}
                >
                  <span>{String.fromCharCode(65 + idx)}</span>
                  {status.isLocked ? <Lock style={{ width: 12, height: 12 }} /> : status.myAC ? <CheckCircle2 style={{ width: 12, height: 12, color: "var(--success)" }} /> : null}
                </button>
              );
            })}
          </div>

          {/* Active Problem Card */}
          {selectedProblem && (
            <div className="neu-card" style={{ padding: "28px 32px", display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, borderBottom: "1px solid var(--shadow-dark)", paddingBottom: 20, flexWrap: "wrap" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                    <span className="neu-chip font-mono" style={{ background: "var(--accent)", color: "#fff" }}>
                      {selectedProblem.problemKey}
                    </span>
                    <h2 style={{ fontWeight: 800, fontSize: "1.3rem", color: "var(--text-primary)", margin: 0 }}>
                      {selectedProblem.name}
                    </h2>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span className="neu-chip font-mono" style={{ background: "var(--warning-soft)", color: "var(--warning)" }}>
                      Rating: {selectedProblem.rating}
                    </span>
                    {(() => {
                      try {
                        return JSON.parse(selectedProblem.tags || "[]").map((tag: string) => (
                          <span key={tag} className="neu-chip font-mono" style={{ fontSize: "0.68rem" }}>
                            {tag}
                          </span>
                        ));
                      } catch { return null; }
                    })()}
                  </div>
                </div>

                <a
                  href={`https://codeforces.com/problemset/problem/${selectedProblem.problemKey?.replace("-", "/")}`}
                  target="_blank" rel="noreferrer"
                  className="neu-btn-primary neu-btn"
                  style={{ padding: "10px 18px", fontSize: "0.8rem", borderRadius: "var(--r-md)" }}
                >
                  <span>Open on Codeforces</span>
                  <ExternalLink style={{ width: 14, height: 14 }} />
                </a>
              </div>

              {/* Problem status banner */}
              <div className="neu-inset" style={{ padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.82rem", flexWrap: "wrap", gap: 8 }}>
                <span className="neu-label">Problem Status</span>
                {(() => {
                  const status = getProblemStatus(selectedProblem);
                  if (status.isLocked) {
                    const lockerHandle = status.lockedByPlayer1 ? player1?.handle : player2?.handle;
                    return (
                      <span className="font-mono" style={{ color: "var(--danger)", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                        <Lock style={{ width: 14, height: 14 }} /> LOCKED by {lockerHandle}
                      </span>
                    );
                  }
                  if (isSupervisor) {
                    return <span className="font-mono" style={{ color: "var(--text-muted)", fontWeight: 700 }}>SUPERVISOR VIEW</span>;
                  }
                  if (status.myAC) {
                    return (
                      <span className="font-mono" style={{ color: "var(--success)", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                        <CheckCircle2 style={{ width: 14, height: 14 }} /> SOLVED BY YOU ✓
                      </span>
                    );
                  }
                  if (status.oppAC) {
                    return <span className="font-mono" style={{ color: "var(--accent)", fontWeight: 700 }}>SOLVED BY OPPONENT</span>;
                  }
                  return <span className="font-mono" style={{ color: "var(--warning)", fontWeight: 700 }}>UNSOLVED — Submit on Codeforces</span>;
                })()}
              </div>

              {/* Instructions */}
              <div className="neu-inset" style={{ padding: "16px 20px", display: "flex", gap: 12, alignItems: "flex-start" }}>
                <AlertCircle style={{ width: 18, height: 18, color: "var(--accent)", flexShrink: 0, marginTop: 2 }} />
                <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  {isSupervisor ? (
                    <span>You are supervising this contest. Competitors submit solutions on Codeforces and results update automatically.</span>
                  ) : (
                    <span>Click <strong>Open on Codeforces</strong> above and submit your solution using handle <strong style={{ color: "var(--accent)" }}>{user?.handle || "your handle"}</strong>. Submissions are detected automatically.</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Scoreboard & Recent Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Scoreboard */}
          <div className="neu-card" style={{ padding: "24px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
            <h3 style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, fontSize: "0.85rem", color: "var(--text-primary)", margin: 0, textTransform: "uppercase" }}>
              <Trophy style={{ width: 16, height: 16, color: "var(--warning)" }} /> Scoreboard
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Player 1 row */}
              <div className="neu-inset" style={{ padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <img src={player1?.avatar || DEFAULT_AVATAR} alt={player1?.handle || "Player 1"} style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text-primary)" }}>{player1?.handle || "Player 1"}</div>
                    <div className="neu-label" style={{ fontSize: "0.6rem" }}>PLAYER 1</div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }} className="font-mono">
                  <div style={{ fontWeight: 800, color: "var(--success)", fontSize: "0.9rem" }}>
                    {contest.mode === "BLITZ" ? `${standings?.host?.lockedWon ?? 0} Locked` : `${standings?.host?.acceptedCount ?? 0} Solved`}
                  </div>
                  {contest.mode === "CLASSIC" && (
                    <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>+{standings?.host?.penaltyMinutes ?? 0}m penalty</div>
                  )}
                </div>
              </div>

              {/* Player 2 row */}
              <div className="neu-inset" style={{ padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <img src={player2?.avatar || DEFAULT_AVATAR} alt={player2?.handle || "Player 2"} style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text-primary)" }}>{player2?.handle || "Player 2"}</div>
                    <div className="neu-label" style={{ fontSize: "0.6rem" }}>PLAYER 2</div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }} className="font-mono">
                  <div style={{ fontWeight: 800, color: "var(--success)", fontSize: "0.9rem" }}>
                    {contest.mode === "BLITZ" ? `${standings?.guest?.lockedWon ?? 0} Locked` : `${standings?.guest?.acceptedCount ?? 0} Solved`}
                  </div>
                  {contest.mode === "CLASSIC" && (
                    <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>+{standings?.guest?.penaltyMinutes ?? 0}m penalty</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Recent Actions */}
          <div className="neu-card" style={{ padding: "24px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
            <h3 style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, fontSize: "0.85rem", color: "var(--text-primary)", margin: 0, textTransform: "uppercase" }}>
              <Activity style={{ width: 16, height: 16, color: "var(--accent)" }} /> Recent Actions
            </h3>

            <div className="neu-inset" style={{ padding: "10px", display: "flex", flexDirection: "column", gap: 8, maxHeight: 260, overflowY: "auto" }}>
              {recentActions.length === 0 ? (
                <p className="font-mono" style={{ fontSize: "0.78rem", color: "var(--text-muted)", textAlign: "center", padding: "20px 0", margin: 0 }}>
                  No submissions recorded yet.
                </p>
              ) : (
                recentActions.map((item: any, idx: number) => {
                  if (item.type === "SUBMISSION") {
                    const sub = item.action;
                    return (
                      <div key={`${sub.id ?? sub.cfSubmissionId}-${idx}`} className="neu-card-sm" style={{ padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <span style={{ fontWeight: 700, fontSize: "0.8rem", color: "var(--text-primary)" }}>{sub.user?.handle || "User"}</span>
                          <span className="font-mono" style={{ fontSize: "0.68rem", color: "var(--text-muted)", display: "block" }}>{sub.problem?.name || "Problem"}</span>
                        </div>
                        <span className="neu-chip font-mono" style={{
                          background: sub.verdict === "OK" ? "var(--success)" : "var(--danger)",
                          color: "#fff", fontSize: "0.65rem", padding: "2px 8px",
                        }}>
                          {sub.verdict === "OK" ? "AC" : sub.verdict?.replace(/_/g, " ")}
                        </span>
                      </div>
                    );
                  }
                  if (item.type === "LEAVE") {
                    return (
                      <div key={idx} className="neu-card-sm" style={{ padding: "8px 12px", background: "var(--warning-soft)", fontSize: "0.75rem", color: "var(--warning)", fontWeight: 600 }}>
                        {item.action?.text || "Player left room"}
                      </div>
                    );
                  }
                  return null;
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Post Contest Modal */}
      {isFinished && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 100,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(233,238,245,0.85)", backdropFilter: "blur(8px)", padding: 20,
        }} className="animate-fade-in">
          <div className="neu-card-lg animate-scale-in" style={{ width: "100%", maxWidth: 520, padding: "36px 40px", textAlign: "center", display: "flex", flexDirection: "column", gap: 20 }}>
            <span className="neu-icon" style={{ width: 64, height: 64, background: "linear-gradient(135deg, var(--warning), #d97706)", margin: "0 auto", boxShadow: "0 0 20px rgba(245,158,11,0.4)" }}>
              <Trophy style={{ width: 32, height: 32, color: "#fff" }} />
            </span>
            <div>
              <h2 style={{ fontWeight: 800, fontSize: "1.6rem", color: "var(--text-primary)", margin: "0 0 6px" }}>Contest Over</h2>
              <p className="font-mono" style={{ fontSize: "0.9rem", color: "var(--accent)", margin: 0, fontWeight: 700 }}>
                {winnerInfo?.isDraw ? "🤝 It's a Draw!" : `🏆 Winner: ${winnerInfo?.winnerHandle || "—"}`}
              </p>
            </div>

            {/* Standings Breakdown */}
            <div className="neu-inset font-mono" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10, textAlign: "left", fontSize: "0.8rem" }}>
              <div className="neu-label" style={{ marginBottom: 4 }}>Final Standings</div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--shadow-dark)", paddingBottom: 8 }}>
                <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{player1?.handle || "Player 1"} (Player 1)</span>
                <span style={{ fontWeight: 700, color: "var(--success)" }}>
                  {contest.mode === "BLITZ"
                    ? `${winnerInfo?.standings?.host?.lockedWon ?? standings?.host?.lockedWon ?? 0} Problems Locked`
                    : `${winnerInfo?.standings?.host?.acceptedCount ?? standings?.host?.acceptedCount ?? 0} Solved | +${winnerInfo?.standings?.host?.penaltyMinutes ?? standings?.host?.penaltyMinutes ?? 0}m`}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{player2?.handle || "Player 2"} (Player 2)</span>
                <span style={{ fontWeight: 700, color: "var(--success)" }}>
                  {contest.mode === "BLITZ"
                    ? `${winnerInfo?.standings?.guest?.lockedWon ?? standings?.guest?.lockedWon ?? 0} Problems Locked`
                    : `${winnerInfo?.standings?.guest?.acceptedCount ?? standings?.guest?.acceptedCount ?? 0} Solved | +${winnerInfo?.standings?.guest?.penaltyMinutes ?? standings?.guest?.penaltyMinutes ?? 0}m`}
                </span>
              </div>
            </div>

            <Link href="/" className="neu-btn-primary neu-btn" style={{ padding: "14px 28px", fontSize: "0.9rem" }}>
              Return to Dashboard
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
