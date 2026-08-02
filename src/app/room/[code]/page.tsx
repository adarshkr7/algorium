"use client";

import React, { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import {
  Swords, Copy, Check, Zap, Shield, Users, Play, WifiOff, AlertTriangle, LogOut, Eye,
} from "lucide-react";
import { useUser } from "@/context/UserContext";
import { createClient } from "@/utils/supabase/client";

export default function RoomLobbyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = use(params);
  const code = rawCode.toUpperCase();
  const { user } = useUser();
  const router = useRouter();
  
  // Need to ensure supabase client is created only once per render/mount
  const [supabase] = useState(() => createClient());

  const [room, setRoom] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [connectedPlayers, setConnectedPlayers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const channelRef = React.useRef<any>(null);

  useEffect(() => {
    let isMounted = true;
    let channel: any;

    async function fetchRoomState() {
      try {
        const res = await fetch(`/api/rooms/${code}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok || !data.room) {
          if (isMounted) setError("Room not found");
          return;
        }

        let currentRoom = data.room;

        if (currentRoom.status === "IN_PROGRESS" || currentRoom.status === "FINISHED") {
          router.push(`/arena/${code}`);
          return;
        }

        const isSupervised = currentRoom.hostingType === "SUPERVISED";
        const isHostUser = user && user.id === currentRoom.hostId;

        // Auto join logic if contestant
        if (user && !isHostUser) {
          const isPlayer1 = currentRoom.player1Id === user.id;
          const isPlayer2 = currentRoom.player2Id === user.id;

          if (!isPlayer1 && !isPlayer2) {
            const joinRes = await fetch(`/api/rooms/${code}/join`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ guestId: user.id }),
            });
            const joinData = await joinRes.json();
            if (joinRes.ok && joinData.room) {
              currentRoom = joinData.room;
              if (currentRoom.status === "IN_PROGRESS") {
                router.push(`/arena/${code}`);
                return;
              }
            }
          }
        }

        if (isMounted) {
          setRoom(currentRoom);
          setError(null);
        }
      } catch (err: any) {
        if (isMounted) setError(err.message || "Failed to load room");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchRoomState();

    const trackingId = user ? user.id : 'guest-' + Math.random().toString(36).substring(7);
    
    channel = supabase.channel(`room-${code}`, {
      config: {
        presence: { key: trackingId },
      },
    });

    channelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        const presenceState = channel.presenceState();
        const players: any[] = [];
        for (const id in presenceState) {
          // @ts-ignore
          players.push(...presenceState[id]);
        }
        if (isMounted) {
          setConnectedPlayers(players);
          // Refetch room state silently in case someone joined
          fetchRoomState();
        }
      })
      .on("broadcast", { event: "contest-started" }, () => {
        router.push(`/arena/${code}`);
      })
      .subscribe(async (status: string) => {
        if (status === "SUBSCRIBED" && user) {
          await channel.track({
            userId: user.id,
            handle: user.handle,
            avatar: user.avatar,
          });
        }
      });

    return () => {
      isMounted = false;
      channelRef.current = null;
      if (channel) supabase.removeChannel(channel);
    };
  }, [code, user, router, supabase]);

  const copyRoomCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStartContest = async () => {
    if (!user || !room || user.id !== room.hostId || starting) return;
    setStarting(true);
    try {
      const res = await fetch(`/api/rooms/${code}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });

      if (res.ok) {
        // Broadcast the start event using the subscribed channelRef
        if (channelRef.current) {
          await channelRef.current.send({
            type: "broadcast",
            event: "contest-started",
          });
        }
        router.push(`/arena/${code}`);
      }
    } catch (e) {
      console.error("Error starting contest:", e);
    } finally {
      setStarting(false);
    }
  };

  const handleLeaveRoom = async () => {
    if (!user) { router.push("/"); return; }
    try {
      await fetch(`/api/rooms/${code}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
    } catch (e) { console.error("Error leaving room:", e); }
    finally { router.push("/"); }
  };

  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 16 }}>
      <div className="neu-icon" style={{ width: 64, height: 64, background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
        <Swords style={{ width: 28, height: 28, color: "var(--text-primary)" }} />
      </div>
      <p className="font-mono" style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>Connecting to Room {code}...</p>
    </div>
  );

  if (error || !room) return (
    <div style={{ maxWidth: 440, margin: "80px auto", textAlign: "center" }}>
      <div className="neu-card" style={{ padding: "40px 36px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <span className="neu-icon" style={{ width: 52, height: 52, background: "var(--danger-soft)", boxShadow: "var(--neu-shadow-sm)" }}>
          <AlertTriangle style={{ width: 22, height: 22, color: "var(--danger)" }} />
        </span>
        <h2 style={{ fontWeight: 800, fontSize: "1.2rem", color: "var(--text-primary)", margin: 0 }}>{error || "Room Not Found"}</h2>
        <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: 0 }}>Please check the 6-character room code and try again.</p>
        <button onClick={() => router.push("/")} className="neu-btn" style={{ marginTop: 8 }}>Return Home</button>
      </div>
    </div>
  );

  const contest = room.contest;
  const isSupervised = room.hostingType === "SUPERVISED";
  const isHost = user && user.id === room.hostId;

  const player1 = isSupervised ? room.player1 : room.host;
  const player2 = isSupervised ? room.player2 : room.guest;

  const isUserP1 = user && player1 && user.id === player1.id;
  const isUserP2 = user && player2 && user.id === player2.id;

  const player1Connected = Boolean(
    player1 && (
      connectedPlayers.some(p => p.userId === player1.id || (p.handle && p.handle.toLowerCase() === player1.handle.toLowerCase())) ||
      true 
    )
  );

  const player2Connected = Boolean(
    player2 && (
      connectedPlayers.some(p => p.userId === player2.id || (p.handle && p.handle.toLowerCase() === player2.handle.toLowerCase())) ||
      true 
    )
  );

  const canStart = Boolean(isHost && player1 && player2 && player1Connected && player2Connected);

  const PlayerCard = ({ player, roleTitle, connected, isWaiting = false }: { player: any; roleTitle: string; connected: boolean; isWaiting?: boolean }) => (
    <div className="neu-card" style={{ padding: "28px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <span className="neu-chip" style={{
          background: roleTitle.includes("HOST") ? "var(--bg-invert)" : "var(--bg-invert)",
          color: "var(--text-invert)",
          border: "none",
        }}>
          {roleTitle}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.72rem", fontWeight: 600, color: connected ? "var(--success)" : isWaiting ? "var(--warning)" : "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>
          {connected
            ? <><span className="status-dot-green" /> CONNECTED</>
            : isWaiting
            ? <><span className="status-dot-amber" /> WAITING TO JOIN</>
            : <><WifiOff style={{ width: 12, height: 12 }} /> DISCONNECTED</>
          }
        </div>
      </div>
      {player ? (
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <img src={player.avatar || "https://codeforces.org/s/0/images/user-alt.png"} alt={player.handle} style={{ width: 60, height: 60, borderRadius: "var(--r-md)", objectFit: "cover", boxShadow: "var(--neu-shadow-sm)" }} />
          <div>
            <h3 style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--text-primary)", margin: "0 0 4px" }}>{player.handle}</h3>
            <p className="font-mono" style={{ fontSize: "0.78rem", color: "var(--accent)", margin: "0 0 4px" }}>Rating: {player.rating} ({player.rank})</p>
            <p className="font-mono" style={{ fontSize: "0.7rem", color: "var(--text-muted)", margin: 0 }}>W: {player.wins} | L: {player.losses} | D: {player.draws}</p>
          </div>
        </div>
      ) : (
        <div className="neu-inset" style={{ padding: "24px 20px", textAlign: "center", borderRadius: "var(--r-md)" }}>
          <Users style={{ width: 28, height: 28, color: "var(--text-muted)", margin: "0 auto 10px" }} />
          <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", fontWeight: 500, margin: 0 }}>
            Share code <strong className="font-mono" style={{ color: "var(--accent)" }}>{code}</strong> to invite competitor
          </p>
        </div>
      )}
    </div>
  );

  return (
    <div className="stagger-children" style={{ maxWidth: 860, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
      <div className="neu-card-lg" style={{ padding: "32px 36px", display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
            <span className="neu-chip" style={{ background: isSupervised ? "var(--warning)" : "var(--accent)", color: "#fff" }}>
              {isSupervised ? "SUPERVISED MATCH" : "1v1 DUEL MODE"}
            </span>
            <span style={{ color: "var(--text-muted)" }}>•</span>
            <span className="font-mono" style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{contest?.name}</span>
          </div>
          <h1 style={{ fontWeight: 800, fontSize: "1.7rem", color: "var(--text-primary)", margin: 0, letterSpacing: "-0.02em" }}>
            {isSupervised ? "Supervising Contest Lobby" : "Waiting for Opponent"}
          </h1>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="neu-inset" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderRadius: "var(--r-md)" }}>
            <div>
              <div className="neu-label" style={{ marginBottom: 2 }}>Room Code</div>
              <div className="font-mono" style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--accent)", letterSpacing: "0.1em" }}>{code}</div>
            </div>
            <button onClick={copyRoomCode} className="neu-btn" style={{ padding: "10px", borderRadius: "50%" }} title="Copy Room Code">
              {copied ? <Check style={{ width: 16, height: 16, color: "var(--success)" }} /> : <Copy style={{ width: 16, height: 16 }} />}
            </button>
          </div>
          <button onClick={handleLeaveRoom} className="neu-btn-danger neu-btn" style={{ padding: "12px 18px", fontSize: "0.82rem" }}>
            <LogOut style={{ width: 14, height: 14 }} /> Leave
          </button>
        </div>
      </div>

      {isSupervised && (
        <div className="neu-card" style={{ padding: "18px 24px", background: "var(--bg-subtle)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, color: "var(--text-primary)", fontSize: "0.85rem", fontWeight: 500 }}>
            <Eye style={{ width: 18, height: 18, flexShrink: 0 }} />
            <span>
              {isHost
                ? "👁️ You are Supervising this match. Share room code with two contestants to duel each other."
                : `👁️ Match Supervised by ${room.host.handle}.`}
            </span>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 }}>
        <PlayerCard
          player={player1}
          roleTitle={isSupervised ? "PLAYER 1" : "HOST (PLAYER 1)"}
          connected={player1Connected}
          isWaiting={!player1}
        />
        <PlayerCard
          player={player2}
          roleTitle={isSupervised ? "PLAYER 2" : "GUEST (PLAYER 2)"}
          connected={player2Connected}
          isWaiting={!player2}
        />
      </div>

      <div className="neu-card" style={{ padding: "24px 28px" }}>
        <h3 style={{ fontWeight: 800, fontSize: "0.82rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16 }}>
          Contest Configuration
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          {[
            { label: "Hosting Type", value: isSupervised ? "Supervised" : "Player Host", icon: isSupervised ? <Eye style={{ width: 14, height: 14, color: "var(--warning)" }} /> : <Swords style={{ width: 14, height: 14, color: "var(--accent)" }} /> },
            { label: "Mode", value: contest.mode, icon: contest.mode === "BLITZ" ? <Zap style={{ width: 14, height: 14, color: "var(--success)" }} /> : <Shield style={{ width: 14, height: 14, color: "var(--accent)" }} /> },
            { label: "Problems", value: `${contest.problemCount}`, icon: null },
            { label: "Duration", value: `${contest.durationMinutes}m`, icon: null },
          ].map((item) => (
            <div key={item.label} className="neu-inset" style={{ padding: "14px 16px", borderRadius: "var(--r-md)" }}>
              <div className="neu-label" style={{ marginBottom: 6 }}>{item.label}</div>
              <div className="font-mono" style={{ fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 5, fontSize: "0.88rem" }}>
                {item.icon}{item.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        {isHost ? (
          <button
            onClick={handleStartContest}
            disabled={!canStart || starting}
            className={canStart ? "neu-btn-primary neu-btn" : "neu-btn"}
            style={{
              width: "100%", padding: "18px 28px", fontSize: "1rem", borderRadius: "var(--r-md)",
            }}
          >
            <Play style={{ width: 18, height: 18 }} />
            {starting
              ? "Starting Contest..."
              : canStart
              ? "START CONTEST NOW"
              : (!player1 || !player2)
              ? (isSupervised ? "Waiting for Both Contestants to Join..." : "Waiting for Guest Player...")
              : "Waiting for Both Contestants to Connect..."}
          </button>
        ) : (
          <div className="neu-inset" style={{ padding: "18px 24px", textAlign: "center", borderRadius: "var(--r-lg)" }}>
            <p className="font-mono" style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: 0 }}>
              Waiting for Host (<strong style={{ color: "var(--accent)" }}>{room.host.handle}</strong>) to start the duel...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
