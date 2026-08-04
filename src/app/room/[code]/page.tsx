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

        if (currentRoom.status === "CANCELLED") {
          if (isMounted) setError("Contest was cancelled");
          setTimeout(() => router.push("/"), 2000);
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
              if (channelRef.current) {
                channelRef.current.send({
                  type: "broadcast",
                  event: "player-joined"
                }).catch(() => {});
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
    
    // Poll every 5 seconds to ensure we never miss a join if websockets drop
    const pollInterval = setInterval(() => {
      if (isMounted) fetchRoomState();
    }, 5000);

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
      .on("broadcast", { event: "player-joined" }, () => {
        if (isMounted) fetchRoomState();
      })
      .on("broadcast", { event: "room-cancelled" }, (payload: any) => {
        window.alert(`Contest ended by ${payload.payload.by}`);
        router.push("/");
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
      clearInterval(pollInterval);
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
    const confirmed = window.confirm("Are you sure you want to quit? This will remove you from the room.");
    if (!confirmed) return;
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
      <p className="font-mono" style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>Connecting to Room <span style={{ color: "#16A34A", fontWeight: 700 }}>{code}</span>...</p>
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
    <div style={{ display: "flex", alignItems: "center", gap: 24, padding: "24px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      {player ? (
        <>
          <img src={player.avatar || "https://codeforces.org/s/0/images/user-alt.png"} alt={player.handle} style={{ width: 64, height: 64, borderRadius: "100px", objectFit: "cover" }} />
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <h3 style={{ fontWeight: 800, fontSize: "1.5rem", color: "#FFFFFF", margin: 0, lineHeight: 1 }}>{player.handle}</h3>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: connected ? "var(--success)" : "var(--danger)", boxShadow: `0 0 10px ${connected ? "var(--success)" : "var(--danger)"}` }} title={connected ? "Connected" : "Disconnected"} />
            </div>
            <div style={{ display: "flex", gap: 16, fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 500, letterSpacing: "0.05em", textTransform: "uppercase" }}>
              <span>{roleTitle}</span>
              <span>•</span>
              <span>Rating: {player.rating}</span>
            </div>
          </div>
        </>
      ) : (
        <>
          <div style={{ width: 64, height: 64, borderRadius: "100px", background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Users style={{ width: 28, height: 28, color: "var(--text-muted)" }} />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontWeight: 800, fontSize: "1.5rem", color: "var(--text-muted)", margin: "0 0 8px", lineHeight: 1 }}>Waiting...</h3>
            <div style={{ display: "flex", gap: 16, fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 500, letterSpacing: "0.05em", textTransform: "uppercase" }}>
              <span>{roleTitle}</span>
              <span>•</span>
              <span style={{ color: "var(--warning)" }}>Pending Join</span>
            </div>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div style={{ position: "fixed", top: 64, left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", overflow: "hidden", padding: "40px 20px" }}>
      <div style={{ maxWidth: 900, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", height: "100%" }}>
        
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 40, flexShrink: 0, flexWrap: "wrap", gap: 20 }}>
          <div>
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 12 }}>
              {isSupervised ? "Supervised Match" : "1v1 Duel"} • {contest?.name}
            </div>
            <h1 style={{ fontWeight: 800, fontSize: "3.5rem", color: "#FFFFFF", margin: 0, letterSpacing: "-0.05em", lineHeight: 0.9 }}>
              Room<br/><span style={{ color: "#16A34A" }}>{code}</span>.
            </h1>
          </div>
          
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={copyRoomCode} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "100px", padding: "12px 24px", color: "#FFF", fontSize: "0.85rem", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
              {copied ? <Check style={{ width: 16, height: 16 }} /> : <Copy style={{ width: 16, height: 16 }} />}
              {copied ? "COPIED" : "COPY CODE"}
            </button>
            <button onClick={handleLeaveRoom} style={{ background: "transparent", border: "1px solid rgba(255,70,70,0.3)", borderRadius: "100px", padding: "12px 24px", color: "var(--danger)", fontSize: "0.85rem", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
              <LogOut style={{ width: 16, height: 16 }} /> QUIT CONTEST
            </button>
          </div>
        </div>

        {/* Configuration Bar */}
        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: "16px", padding: "20px 24px", marginBottom: 40, display: "flex", gap: 32, flexShrink: 0, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Mode</span>
            <span style={{ fontSize: "1.1rem", color: "#FFF", fontWeight: 700 }}>{contest.mode}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Problems</span>
            <span style={{ fontSize: "1.1rem", color: "#FFF", fontWeight: 700 }}>{contest.problemCount}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Duration</span>
            <span style={{ fontSize: "1.1rem", color: "#FFF", fontWeight: 700 }}>{contest.durationMinutes} min</span>
          </div>
          {isSupervised && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Supervisor</span>
              <span style={{ fontSize: "1.1rem", color: "#FFF", fontWeight: 700 }}>{room.host.handle}</span>
            </div>
          )}
        </div>

        {/* Players Area */}
        <div style={{ flex: 1, overflowY: "auto", paddingRight: 20 }}>
          <PlayerCard
            player={player1}
            roleTitle={isSupervised ? "Player 1" : "Host"}
            connected={player1Connected}
            isWaiting={!player1}
          />
          <PlayerCard
            player={player2}
            roleTitle={isSupervised ? "Player 2" : "Guest"}
            connected={player2Connected}
            isWaiting={!player2}
          />
        </div>

        {/* Action Button */}
        <div style={{ marginTop: 24, paddingBottom: 24, flexShrink: 0 }}>
          {isHost ? (
            <button
              onClick={handleStartContest}
              disabled={!canStart || starting}
              style={{ 
                background: canStart ? "#FFFFFF" : "rgba(255,255,255,0.05)", 
                color: canStart ? "#000000" : "rgba(255,255,255,0.3)", 
                width: "100%", padding: "24px", 
                fontSize: "1.2rem", fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase",
                border: "none", cursor: (!canStart || starting) ? "not-allowed" : "pointer", 
                transition: "all 0.2s"
              }}
            >
              {starting
                ? "STARTING CONTEST..."
                : canStart
                ? "START CONTEST NOW"
                : (!player1 || !player2)
                ? (isSupervised ? "WAITING FOR PLAYERS..." : "WAITING FOR GUEST...")
                : "WAITING FOR CONNECTIONS..."}
            </button>
          ) : (
            <div style={{ padding: "24px", textAlign: "center", background: "rgba(255,255,255,0.03)", color: "var(--text-secondary)", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", fontSize: "0.9rem" }}>
              WAITING FOR HOST TO START...
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
