"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import {
  Trophy, Swords, CheckCircle2, XCircle, MinusCircle, ArrowLeft, ExternalLink, KeyRound
} from "lucide-react";
import { useUser } from "@/context/UserContext";

export default function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle: rawHandle } = use(params);
  const handle = decodeURIComponent(rawHandle);
  const { user: currentUser } = useUser();

  const [profileData, setProfileData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadProfile() {
      try {
        setLoading(true);
        const res = await fetch(`/api/profile/${encodeURIComponent(handle)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "User profile not found");
        setProfileData(data);
      } catch (err: any) { setError(err.message); }
      finally { setLoading(false); }
    }
    loadProfile();
  }, [handle]);

  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 16 }}>
      <div className="neu-icon" style={{ width: 64, height: 64, background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
        <Trophy style={{ width: 30, height: 30, color: "var(--text-primary)" }} />
      </div>
      <p className="font-mono" style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>Loading profile for {handle}...</p>
    </div>
  );

  if (error || !profileData) return (
    <div style={{ maxWidth: 440, margin: "80px auto", textAlign: "center", display: "flex", flexDirection: "column", gap: 20, alignItems: "center" }}>
      <div className="neu-card" style={{ padding: "36px 40px" }}>
        <h2 style={{ fontWeight: 800, fontSize: "1.3rem", color: "var(--text-primary)", marginBottom: 20 }}>{error || "Profile Not Found"}</h2>
        <Link href="/" className="neu-btn" style={{ display: "inline-flex" }}>
          <ArrowLeft style={{ width: 15, height: 15 }} /> Back to Home
        </Link>
      </div>
    </div>
  );

  const { user, stats, matchHistory } = profileData;

  const statCards = [
    { label: "Matches Played", value: stats.totalMatches, color: "var(--text-primary)" },
    { label: "Victories", value: stats.wins, color: "var(--success)" },
    { label: "Defeats", value: stats.losses, color: "var(--danger)" },
    { label: "Win Rate", value: `${stats.winRate}%`, color: "var(--accent)" },
  ];

  return (
    <div className="stagger-children" style={{ maxWidth: 860, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Profile banner */}
      <div className="neu-card-lg" style={{ padding: "36px 40px", display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 28, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
          <img
            src={user.avatar} alt={user.handle}
            style={{ width: 96, height: 96, borderRadius: "var(--r-lg)", objectFit: "cover", boxShadow: "var(--neu-shadow)" }}
          />
          <span style={{
            position: "absolute", bottom: -6, right: -6,
            background: "var(--bg-invert)",
            borderRadius: "50%", width: 24, height: 24,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Swords style={{ width: 12, height: 12, color: "var(--text-invert)" }} />
          </span>
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
            <h1 style={{ fontWeight: 800, fontSize: "2rem", color: "var(--text-primary)", margin: 0, letterSpacing: "-0.02em" }}>
              {user.handle}
            </h1>
            <span className="neu-chip" style={{ background: "var(--success)", color: "#fff" }}>
              {user.rank}
            </span>
          </div>
          <div className="font-mono" style={{ fontSize: "0.82rem", color: "var(--text-secondary)", display: "flex", gap: 20 }}>
            <span>Rating: <strong style={{ color: "var(--success)" }}>{user.rating}</strong></span>
            <span>Max: <strong style={{ color: "var(--warning)" }}>{user.maxRating}</strong></span>
          </div>
          </div>
        </div>

        {currentUser && currentUser.handle === user.handle && (
          <Link href="/change-pass" className="neu-btn" style={{ padding: "10px 18px", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: 8 }}>
            <KeyRound style={{ width: 16, height: 16, color: "var(--accent)" }} />
            <span>Change Password</span>
          </Link>
        )}
      </div>

      {/* Stats grid */}
      <div className="stagger-children" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        {statCards.map((sc) => (
          <div key={sc.label} className="neu-card" style={{ padding: "22px 18px", textAlign: "center" }}>
            <div className="neu-label" style={{ marginBottom: 8 }}>{sc.label}</div>
            <div className="font-mono" style={{ fontSize: "1.8rem", fontWeight: 800, color: sc.color }}>{sc.value}</div>
          </div>
        ))}
      </div>

      {/* Match history */}
      <div className="neu-card" style={{ padding: "28px 32px" }}>
        <h3 style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 800, fontSize: "0.9rem", color: "var(--text-primary)", marginBottom: 20 }}>
          <span className="neu-icon" style={{ width: 32, height: 32, background: "var(--bg-invert)", border: "none" }}>
            <Swords style={{ width: 14, height: 14, color: "var(--text-invert)" }} />
          </span>
          Recent Match History
        </h3>

        {matchHistory.length === 0 ? (
          <div className="neu-inset" style={{ padding: "40px 24px", textAlign: "center" }}>
            <p className="font-mono" style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
              No match history recorded yet. Host or join a duel to get started!
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 8px" }}>
              <thead>
                <tr>
                  {["Result", "Opponent", "Mode", "Score", "Date", ""].map((h) => (
                    <th key={h} className="neu-label" style={{ textAlign: "left", padding: "0 12px 8px", fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matchHistory.map((match: any) => (
                  <tr key={match.id}>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "4px 12px", borderRadius: "var(--r-pill)",
                        fontSize: "0.72rem", fontWeight: 700,
                        background: match.result === "WIN" ? "var(--success)" : match.result === "LOSS" ? "var(--danger)" : "var(--bg-subtle)",
                        color: match.result === "WIN" || match.result === "LOSS" ? "#fff" : "var(--text-primary)",
                      }}>
                        {match.result === "WIN" ? <CheckCircle2 style={{ width: 11, height: 11 }} /> : match.result === "LOSS" ? <XCircle style={{ width: 11, height: 11 }} /> : <MinusCircle style={{ width: 11, height: 11 }} />}
                        {match.result}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", fontWeight: 700, color: "var(--text-primary)", fontSize: "0.88rem" }}>{match.opponentHandle}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span className="neu-chip font-mono">{match.mode}</span>
                    </td>
                    <td style={{ padding: "10px 12px", fontWeight: 700, color: "var(--text-secondary)", fontFamily: "JetBrains Mono, monospace", fontSize: "0.85rem" }}>
                      {match.userScore} – {match.opponentScore}
                    </td>
                    <td style={{ padding: "10px 12px", color: "var(--text-muted)", fontSize: "0.78rem", fontFamily: "JetBrains Mono, monospace" }}>
                      {new Date(match.playedAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {match.roomCode && (
                        <Link
                          href={`/arena/${match.roomCode}`}
                          className="neu-btn"
                          style={{ padding: "6px 12px", fontSize: "0.72rem", gap: 5, height: 30 }}
                          title="Open contest page"
                        >
                          <ExternalLink style={{ width: 11, height: 11 }} />
                          View
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
