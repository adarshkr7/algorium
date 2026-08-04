"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import {
  Trophy, Swords, CheckCircle2, XCircle, MinusCircle, ArrowLeft, ArrowRight, ExternalLink, KeyRound
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
      <div style={{ padding: "40px", display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 28, flexWrap: "wrap", background: "rgba(255,255,255,0.02)", borderRadius: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <img
              src={user.avatar} alt={user.handle}
              style={{ width: 100, height: 100, borderRadius: "50%", objectFit: "cover" }}
            />
            <span style={{
              position: "absolute", bottom: -4, right: -4,
              background: "#FFFFFF",
              borderRadius: "50%", width: 28, height: 28,
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "3px solid #000"
            }}>
              <Swords style={{ width: 14, height: 14, color: "#000" }} />
            </span>
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
              <h1 style={{ fontWeight: 800, fontSize: "2.4rem", color: "#FFFFFF", margin: 0, letterSpacing: "-0.02em" }}>
                {user.handle}
              </h1>
              <span style={{ padding: "4px 12px", background: "rgba(255,255,255,0.1)", color: "#FFFFFF", borderRadius: "100px", fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                {user.rank}
              </span>
            </div>
            <div className="font-mono" style={{ fontSize: "0.9rem", color: "var(--text-muted)", display: "flex", gap: 24 }}>
              <span>Rating <strong style={{ color: "var(--success)" }}>{user.rating}</strong></span>
              <span>Max <strong style={{ color: "#FFFFFF" }}>{user.maxRating}</strong></span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a href={`https://codeforces.com/profile/${user.handle}`} target="_blank" rel="noopener noreferrer" style={{ padding: "10px 20px", fontSize: "0.85rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.05)", color: "#FFFFFF", borderRadius: "100px", textDecoration: "none" }}>
            <ExternalLink style={{ width: 16, height: 16 }} />
            <span>Codeforces</span>
          </a>
          {currentUser && currentUser.handle === user.handle && (
            <Link href="/change-pass" style={{ padding: "10px 20px", fontSize: "0.85rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 8, background: "#FFFFFF", color: "#000000", borderRadius: "100px", textDecoration: "none" }}>
              <KeyRound style={{ width: 16, height: 16 }} />
              <span>Change Password</span>
            </Link>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="stagger-children" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        {statCards.map((sc) => (
          <div key={sc.label} style={{ padding: "32px 24px", textAlign: "center", background: "rgba(255,255,255,0.02)", borderRadius: "20px" }}>
            <div style={{ marginBottom: 12, fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{sc.label}</div>
            <div className="font-mono" style={{ fontSize: "2rem", fontWeight: 800, color: sc.color }}>{sc.value}</div>
          </div>
        ))}
      </div>

      {/* Match history */}
      <div style={{ marginTop: "16px" }}>
        <h3 style={{ display: "flex", alignItems: "center", gap: 12, fontWeight: 700, fontSize: "0.85rem", color: "var(--text-muted)", letterSpacing: "0.15em", marginBottom: 24, textTransform: "uppercase" }}>
          <Swords style={{ width: 18, height: 18, color: "var(--accent)" }} /> Recent Match History
        </h3>

        {matchHistory.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", background: "rgba(255,255,255,0.02)", borderRadius: "20px" }}>
            <p className="font-mono" style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
              No match history recorded yet. Host or join a duel to get started!
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {matchHistory.map((match: any) => (
              <div key={match.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
                padding: "20px 24px",
                background: "rgba(255,255,255,0.02)", borderRadius: "16px"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                  <div style={{
                    width: 70, textAlign: "center", padding: "6px 0", borderRadius: "8px",
                    background: match.result === "WIN" ? "rgba(16,185,129,0.1)" : match.result === "LOSS" ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.05)",
                    color: match.result === "WIN" ? "var(--success)" : match.result === "LOSS" ? "var(--danger)" : "var(--text-muted)",
                    fontSize: "0.75rem", fontWeight: 800, letterSpacing: "0.05em"
                  }}>
                    {match.result}
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, color: "#FFFFFF", fontSize: "1.1rem" }}>{match.opponentHandle}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {match.mode} • {new Date(match.playedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
                  <div className="font-mono" style={{ fontWeight: 800, color: "var(--text-primary)", fontSize: "1.2rem", textAlign: "right" }}>
                    {match.userScore} <span style={{ color: "var(--text-muted)", margin: "0 8px" }}>—</span> {match.opponentScore}
                  </div>
                  {match.roomCode && (
                    <Link
                      href={`/arena/${match.roomCode}`}
                      style={{ padding: "8px 16px", fontSize: "0.8rem", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.05)", color: "#FFFFFF", borderRadius: "100px", textDecoration: "none" }}
                    >
                      <span>Arena</span>
                      <ArrowRight style={{ width: 14, height: 14 }} />
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
