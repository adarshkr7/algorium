"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Swords, Zap, Shield, ArrowRight, CheckCircle2,
  Code2, Braces, Terminal, FileCode2, Cpu
} from "lucide-react";
import { useUser } from "@/context/UserContext";

export default function HomePage() {
  const { user } = useUser();
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCode.trim()) return;
    if (!user) { setError("Please sign in with your Codeforces handle first!"); return; }
    router.push(`/room/${roomCode.trim().toUpperCase()}`);
  };

  return (
    <div style={{ position: "fixed", top: 64, left: 0, right: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: "0 40px" }}>
      
      {/* ── Background Floating Icons ── */}
      <div style={{ position: "absolute", inset: "-100px", overflow: "hidden", pointerEvents: "none", zIndex: -2 }}>
        <Code2 style={{ position: "absolute", top: "10%", left: "5%", width: 140, height: 140, color: "#ffffff", opacity: 0.02, transform: "rotate(-15deg)" }} />
        <Braces style={{ position: "absolute", bottom: "10%", left: "35%", width: 220, height: 220, color: "#ffffff", opacity: 0.015, transform: "rotate(10deg)" }} />
        <Terminal style={{ position: "absolute", top: "15%", right: "8%", width: 160, height: 160, color: "#ffffff", opacity: 0.02, transform: "rotate(25deg)" }} />
        <FileCode2 style={{ position: "absolute", bottom: "15%", right: "20%", width: 120, height: 120, color: "#ffffff", opacity: 0.02, transform: "rotate(-10deg)" }} />
        <Cpu style={{ position: "absolute", top: "50%", left: "45%", width: 90, height: 90, color: "#ffffff", opacity: 0.02, transform: "rotate(5deg)" }} />
      </div>

      <div style={{ position: "relative", maxWidth: 1200, width: "100%", display: "flex", flexDirection: "row", alignItems: "center", gap: 80, justifyContent: "space-between", flexWrap: "wrap", zIndex: 1 }}>

      {/* ── Left Side (Hero) ── */}
      <section className="animate-blur-reveal" style={{ textAlign: "left", flex: "1 1 400px", maxWidth: 500 }}>
        <div style={{
          position: "absolute",
          top: "30%",
          left: "20%",
          transform: "translate(-50%, -50%)",
          width: "50vw",
          height: "60vh",
          background: "radial-gradient(circle, rgba(255,255,255,0.03) 0%, rgba(0,0,0,0) 70%)",
          pointerEvents: "none",
          zIndex: -1
        }} />
        <h1 style={{
          fontSize: "clamp(3rem, 6vw, 5rem)",
          fontWeight: 800,
          lineHeight: 1.05,
          color: "#FFFFFF",
          marginBottom: 24,
          letterSpacing: "-0.05em",
        }}>
          Duel Programmers<br />
          <span style={{ color: "var(--text-muted)", fontWeight: 500, fontSize: "clamp(2.5rem, 4.5vw, 4rem)" }}>in Real-Time</span>
        </h1>

        <p style={{
          fontSize: "1.1rem",
          color: "var(--text-secondary)",
          maxWidth: 480,
          marginBottom: 48,
          lineHeight: 1.6,
        }}>
          Race through Blitz Mode or outsmart opponents in Classic Duel — powered by official Codeforces problems.
        </p>

        {/* Join / Create actions */}
        <div style={{ maxWidth: 360, display: "flex", flexDirection: "column", gap: 32 }}>
          <form onSubmit={handleJoinRoom} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <input
              type="text"
              placeholder="Enter Room Code..."
              value={roomCode}
              onChange={(e) => { setRoomCode(e.target.value.toUpperCase()); setError(null); }}
              maxLength={6}
              className="neu-input-minimal font-mono"
              style={{ textAlign: "left", letterSpacing: "0.2em", fontSize: "1.2rem" }}
            />
            <button type="submit" className="neu-btn-primary neu-btn" style={{ padding: "14px", borderRadius: "var(--r-pill)", width: "100%", justifyContent: "center", fontSize: "0.95rem" }}>
              <span>Join Duel</span>
            </button>
          </form>

          {error && (
            <p className="animate-shake" style={{ fontSize: "0.85rem", color: "var(--danger)", fontWeight: 600, marginTop: "-16px" }}>{error}</p>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 16, opacity: 0.5 }}>
            <hr className="neu-divider" style={{ flex: 1 }} />
            <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.1em" }}>OR</span>
            <hr className="neu-divider" style={{ flex: 1 }} />
          </div>

          <Link href="/create" className="minimal-link-group" style={{ justifyContent: "center", fontSize: "1rem" }}>
            <span>Host a new contest</span>
            <ArrowRight className="arrow-icon" style={{ width: 16, height: 16 }} />
          </Link>
        </div>
      </section>

      {/* ── Right Side (Mode Cards) ── */}
      <section className="stagger-children" style={{ display: "flex", flexDirection: "column", gap: 64, flex: "1 1 400px", maxWidth: 440 }}>
        
        {/* Blitz Mode */}
        <div style={{ padding: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <Zap style={{ width: 20, height: 20, color: "var(--text-muted)" }} />
            <h2 style={{ fontWeight: 600, fontSize: "1.4rem", color: "#FFFFFF", margin: 0, letterSpacing: "-0.02em" }}>Blitz Mode</h2>
          </div>
          <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 20, maxWidth: 360 }}>
            High-speed linear race where solved problems are permanently locked for your opponent.
          </p>
          <Link href="/create?mode=BLITZ" className="minimal-link-group">
            <span>Host Blitz</span>
            <ArrowRight className="arrow-icon" style={{ width: 14, height: 14 }} />
          </Link>
        </div>

        {/* Classic Duel */}
        <div style={{ padding: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <Shield style={{ width: 20, height: 20, color: "var(--text-muted)" }} />
            <h2 style={{ fontWeight: 600, fontSize: "1.4rem", color: "#FFFFFF", margin: 0, letterSpacing: "-0.02em" }}>Classic Duel</h2>
          </div>
          <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 20, maxWidth: 360 }}>
            Traditional ICPC style contest with penalty time calculations.
          </p>
          <Link href="/create?mode=CLASSIC" className="minimal-link-group">
            <span>Host Classic</span>
            <ArrowRight className="arrow-icon" style={{ width: 14, height: 14 }} />
          </Link>
        </div>

      </section>
      </div>
    </div>
  );
}
