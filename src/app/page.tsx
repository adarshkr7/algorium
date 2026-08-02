"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Swords, Zap, Shield, ArrowRight, CheckCircle2,
} from "lucide-react";
import { useUser } from "@/context/UserContext";

export default function HomePage() {
  const { user } = useUser();
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<any>(null);

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCode.trim()) return;
    if (!user) { setError("Please sign in with your Codeforces handle first!"); return; }
    router.push(`/room/${roomCode.trim().toUpperCase()}`);
  };

  React.useEffect(() => {
    if (!user) return;
    async function loadStats() {
      try {
        const res = await fetch(`/api/profile/${encodeURIComponent(user.handle)}`);
        const data = await res.json();
        if (res.ok) setProfileData(data);
      } catch (err) {
        console.error("Failed to load user dashboard stats:", err);
      }
    }
    loadStats();
  }, [user]);

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", flexDirection: "column", gap: 48 }}>

      {/* ── Hero ── */}
      <section className="animate-blur-reveal" style={{ textAlign: "center", paddingTop: 40, paddingBottom: 16 }}>
        <h1 style={{
          fontSize: "clamp(2.4rem, 6vw, 4rem)",
          fontWeight: 800,
          lineHeight: 1.1,
          color: "var(--text-primary)",
          marginBottom: 20,
          letterSpacing: "-0.04em",
        }}>
          Duel Programmers<br />
          <span style={{ color: "var(--text-muted)" }}>in Real-Time</span>
        </h1>

        <p style={{
          fontSize: "1.05rem",
          color: "var(--text-secondary)",
          maxWidth: 560,
          margin: "0 auto 36px",
          lineHeight: 1.7,
        }}>
          Race through Blitz Mode or outsmart opponents in Classic Duel — powered by official Codeforces problems.
        </p>

        {/* Join / Create actions */}
        <div style={{ maxWidth: 520, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
          <form onSubmit={handleJoinRoom} style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <input
                type="text"
                placeholder="Room code (e.g. A9X2PQ)"
                value={roomCode}
                onChange={(e) => { setRoomCode(e.target.value.toUpperCase()); setError(null); }}
                maxLength={6}
                className="neu-input font-mono"
                style={{ textAlign: "center", letterSpacing: "0.14em", fontSize: "1.1rem", padding: "14px 18px" }}
              />
            </div>
            <button type="submit" className="neu-btn-primary neu-btn" style={{ padding: "14px 28px", flexShrink: 0, borderRadius: "var(--r-md)" }}>
              <span>Join</span>
              <ArrowRight style={{ width: 16, height: 16 }} />
            </button>
          </form>

          {error && (
            <p className="animate-shake" style={{ fontSize: "0.8rem", color: "var(--danger)", fontWeight: 600 }}>{error}</p>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <hr className="neu-divider" style={{ flex: 1 }} />
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>OR</span>
            <hr className="neu-divider" style={{ flex: 1 }} />
          </div>

          <Link
            href="/create"
            className="neu-btn"
            style={{ padding: "14px 28px", justifyContent: "center", borderRadius: "var(--r-md)", fontSize: "0.9rem" }}
          >
            <Swords style={{ width: 16, height: 16, color: "var(--accent)" }} />
            <span style={{ fontWeight: 700 }}>Create New Contest Room</span>
            <ArrowRight style={{ width: 15, height: 15, color: "var(--text-muted)" }} />
          </Link>
        </div>
      </section>

      {/* ── User Dashboard Live Stats Bar (If signed in) ── */}
      {user && profileData && (
        <section className="animate-fade-in-up" style={{ maxWidth: 840, margin: "0 auto", width: "100%" }}>
          <div className="neu-card" style={{ padding: "24px 32px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <img src={user.avatar} alt={user.handle} style={{ width: 42, height: 42, borderRadius: "50%", objectFit: "cover" }} />
                <div>
                  <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--text-primary)" }}>{user.handle}</div>
                  <div className="neu-label font-mono" style={{ fontSize: "0.68rem" }}>{user.rank} • Rating: {user.rating}</div>
                </div>
              </div>
              <Link href={`/profile/${encodeURIComponent(user.handle)}`} className="neu-btn" style={{ padding: "8px 16px", fontSize: "0.78rem" }}>
                <span>View Full Profile</span>
                <ArrowRight style={{ width: 14, height: 14 }} />
              </Link>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12 }}>
              {[
                { label: "Matches Played", value: profileData.stats.totalMatches, color: "var(--text-primary)" },
                { label: "Victories (Wins)", value: profileData.stats.wins, color: "var(--success)" },
                { label: "Defeats (Losses)", value: profileData.stats.losses, color: "var(--danger)" },
                { label: "Win Rate", value: `${profileData.stats.winRate}%`, color: "var(--accent)" },
              ].map((st) => (
                <div key={st.label} className="neu-inset" style={{ padding: "14px 16px", textAlign: "center", borderRadius: "var(--r-md)" }}>
                  <div className="neu-label" style={{ marginBottom: 4 }}>{st.label}</div>
                  <div className="font-mono" style={{ fontSize: "1.4rem", fontWeight: 800, color: st.color }}>{st.value}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Mode Cards ── */}
      <section className="stagger-children" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 28 }}>

        {/* Blitz Mode */}
        <div className="neu-card" style={{ padding: "36px 32px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
            <span className="neu-icon" style={{ width: 40, height: 40 }}>
              <Zap style={{ width: 20, height: 20, color: "var(--text-primary)" }} />
            </span>
            <div>
              <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: 2, letterSpacing: "0.05em" }}>MODE 1</div>
              <h2 style={{ fontWeight: 700, fontSize: "1.25rem", color: "var(--text-primary)", margin: 0, letterSpacing: "-0.02em" }}>Blitz Mode</h2>
            </div>
          </div>

          <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 24 }}>
            High-speed linear race. Only Problem A is unlocked initially. Solved problems are permanently locked for your opponent!
          </p>

          <ul style={{ listStyle: "none", margin: "0 0 28px", padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              "Instant permanent lock on Accepted verdict",
              "Both players advance to next problem together",
              "Winner determined by problems locked",
            ].map((feat) => (
              <li key={feat} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                <CheckCircle2 style={{ width: 15, height: 15, color: "var(--success)", flexShrink: 0, marginTop: 1 }} />
                {feat}
              </li>
            ))}
          </ul>

          <Link
            href="/create?mode=BLITZ"
            className="neu-btn"
            style={{ fontSize: "0.82rem", padding: "10px 22px", display: "inline-flex" }}
          >
            <span>Host a Blitz Contest</span>
            <ArrowRight style={{ width: 14, height: 14, color: "var(--success)" }} />
          </Link>
        </div>

        {/* Classic Duel */}
        <div className="neu-card" style={{ padding: "36px 32px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
            <span className="neu-icon" style={{ width: 40, height: 40 }}>
              <Shield style={{ width: 20, height: 20, color: "var(--text-primary)" }} />
            </span>
            <div>
              <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: 2, letterSpacing: "0.05em" }}>MODE 2</div>
              <h2 style={{ fontWeight: 700, fontSize: "1.25rem", color: "var(--text-primary)", margin: 0, letterSpacing: "-0.02em" }}>Classic Duel</h2>
            </div>
          </div>

          <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 24 }}>
            Traditional ICPC style contest. All problems are available immediately. Solve in any order with penalty time calculations.
          </p>

          <ul style={{ listStyle: "none", margin: "0 0 28px", padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              "All problems unlocked from minute zero",
              "20-minute penalty per wrong submission prior to AC",
              "Ranked by Accepted count, then penalty time",
            ].map((feat) => (
              <li key={feat} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                <CheckCircle2 style={{ width: 15, height: 15, color: "var(--accent)", flexShrink: 0, marginTop: 1 }} />
                {feat}
              </li>
            ))}
          </ul>

          <Link
            href="/create?mode=CLASSIC"
            className="neu-btn"
            style={{ fontSize: "0.82rem", padding: "10px 22px", display: "inline-flex" }}
          >
            <span>Host a Classic Duel</span>
            <ArrowRight style={{ width: 14, height: 14, color: "var(--accent)" }} />
          </Link>
        </div>
      </section>
    </div>
  );
}
