"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Book, Swords, Zap, Users, Trophy, ChevronRight, CheckCircle2, ShieldAlert } from "lucide-react";

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState("intro");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: "-20% 0px -80% 0px" } // trigger when near top
    );

    document.querySelectorAll("section[id]").forEach((section) => {
      observer.observe(section);
    });

    return () => observer.disconnect();
  }, []);

  const navItems = [
    { id: "intro", label: "Introduction", icon: <Book style={{ width: 16, height: 16 }} /> },
    { id: "modes", label: "Game Modes", icon: <Swords style={{ width: 16, height: 16 }} /> },
    { id: "scoring", label: "Scoring Systems", icon: <Zap style={{ width: 16, height: 16 }} /> },
    { id: "rooms", label: "Rooms & Spectating", icon: <Users style={{ width: 16, height: 16 }} /> },
    { id: "standings", label: "Standings & Ratings", icon: <Trophy style={{ width: 16, height: 16 }} /> },
  ];

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", gap: 40, alignItems: "flex-start", padding: "40px 20px" }}>
      
      {/* Sidebar Navigation */}
      <nav style={{
        position: "sticky",
        top: 100,
        width: 260,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }} className="hidden md:flex">
        <div style={{ marginBottom: 16, paddingLeft: 16 }}>
          <h2 style={{ fontSize: "0.8rem", fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Documentation
          </h2>
        </div>
        
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => scrollTo(item.id)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "12px 16px",
              borderRadius: "12px",
              background: activeSection === item.id ? "rgba(255,255,255,0.05)" : "transparent",
              color: activeSection === item.id ? "#FFFFFF" : "var(--text-secondary)",
              border: "none",
              cursor: "pointer",
              textAlign: "left",
              fontWeight: activeSection === item.id ? 700 : 500,
              fontSize: "0.95rem",
              transition: "all 0.2s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ color: activeSection === item.id ? "var(--accent)" : "var(--text-muted)" }}>
                {item.icon}
              </span>
              {item.label}
            </div>
            {activeSection === item.id && <ChevronRight style={{ width: 14, height: 14, color: "var(--text-muted)" }} />}
          </button>
        ))}
      </nav>

      {/* Main Content Area */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", gap: 80, paddingBottom: 100 }}>
        
        {/* Intro */}
        <section id="intro" style={{ scrollMarginTop: 100 }}>
          <div style={{ marginBottom: 32 }}>
            <h1 style={{ fontSize: "3rem", fontWeight: 800, color: "#FFFFFF", letterSpacing: "-0.03em", marginBottom: 16 }}>
              Welcome to Algorium, Twin 💅
            </h1>
            <p style={{ fontSize: "1.15rem", color: "var(--text-secondary)", lineHeight: 1.6, maxWidth: 700 }}>
              Algorium is the GOAT of real-time 1v1 platforms, built on top of Codeforces. No cap, it's time to crash out against your opps in intense programming duels, looksmax your rating on the global leaderboard, and flex that you're him (or her, very demure). 
            </p>
          </div>
          <div style={{ background: "rgba(255,255,255,0.02)", padding: 32, borderRadius: 24 }}>
            <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#FFFFFF", marginBottom: 16 }}>Soft Launching Your Account</h3>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 16 }}>
              <li style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <CheckCircle2 style={{ width: 20, height: 20, color: "var(--success)", flexShrink: 0, marginTop: 2 }} />
                <div>
                  <strong style={{ color: "#FFF" }}>No Cap:</strong>
                  <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: "0.95rem", lineHeight: 1.5 }}>
                    Click "Sign In with CF" in the top right. We use a compilation error verification method to get the receipts and securely prove you actually own the handle. Fr fr.
                  </p>
                </div>
              </li>
              <li style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <CheckCircle2 style={{ width: 20, height: 20, color: "var(--success)", flexShrink: 0, marginTop: 2 }} />
                <div>
                  <strong style={{ color: "#FFF" }}>Verification:</strong>
                  <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: "0.95rem", lineHeight: 1.5 }}>
                    First time? You gotta verify your identity by submitting a script that hits a Compilation Error for a specified problem. After that, you can set your email and password. It's a canon event.
                  </p>
                </div>
              </li>
              <li style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <CheckCircle2 style={{ width: 20, height: 20, color: "var(--success)", flexShrink: 0, marginTop: 2 }} />
                <div>
                  <strong style={{ color: "#FFF" }}>Womp Womp:</strong>
                  <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: "0.95rem", lineHeight: 1.5 }}>
                    Brainrot got you forgetting your password? Big yikes. Just click "Forgot Password?". You'll have to repeat the Codeforces verification to prove you aren't an NPC trying to steal an account.
                  </p>
                </div>
              </li>
              <li style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <CheckCircle2 style={{ width: 20, height: 20, color: "var(--success)", flexShrink: 0, marginTop: 2 }} />
                <div>
                  <strong style={{ color: "#FFF" }}>LFG:</strong>
                  <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: "0.95rem", lineHeight: 1.5 }}>
                    Host a duel from the homepage and drop your 6-character room code, or paste your bro's code to jump into their lobby. Say less!
                  </p>
                </div>
              </li>
            </ul>
          </div>
        </section>

        {/* Game Modes */}
        <section id="modes" style={{ scrollMarginTop: 100 }}>
          <h2 style={{ fontSize: "2rem", fontWeight: 800, color: "#FFFFFF", letterSpacing: "-0.02em", marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
            <Swords style={{ color: "var(--accent)" }} />
            Aesthetic
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ background: "rgba(255,255,255,0.02)", padding: 32, borderRadius: 24, border: "1px solid rgba(59,130,246,0.2)" }}>
              <h3 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#FFFFFF", marginBottom: 12 }}>Type Shi</h3>
              <p style={{ color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 16 }}>
                The traditional competitive programming experience. Both players have access to all problems from the jump. You can cook them in any order you choose. Valid.
              </p>
              <ul style={{ color: "var(--text-muted)", fontSize: "0.95rem", lineHeight: 1.6, paddingLeft: 20 }}>
                <li>Strategy is key: dive into hard problems first for massive points, or sweep the easy ones to build a lead (Boy math).</li>
                <li>The winner is determined only when the contest timer expires. Standing on business!</li>
              </ul>
            </div>

            <div style={{ background: "rgba(255,255,255,0.02)", padding: 32, borderRadius: 24, border: "1px solid rgba(34,197,94,0.2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <h3 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#FFFFFF", margin: 0 }}>Lockout Mode</h3>
                <span style={{ padding: "4px 10px", background: "rgba(34,197,94,0.1)", color: "var(--success)", borderRadius: 100, fontSize: "0.75rem", fontWeight: 800, textTransform: "uppercase" }}>Free for All</span>
              </div>
              <p style={{ color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 16 }}>
                A wild free-for-all race where any problem can be attempted at any time. <strong>The first player to solve a problem locks it</strong>, leaving the opponent cooked and unable to submit.
              </p>
              <ul style={{ color: "var(--text-muted)", fontSize: "0.95rem", lineHeight: 1.6, paddingLeft: 20 }}>
                <li>Solve problems in any order to secure points and ratio your opponent.</li>
                <li>Keep an eye on what your opponent is working on! (Very mindful, very demure).</li>
                <li>The contest ends when all problems are locked or the timer expires.</li>
              </ul>
            </div>

            <div style={{ background: "rgba(255,255,255,0.02)", padding: 32, borderRadius: 24, border: "1px solid rgba(234,179,8,0.2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <h3 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#FFFFFF", margin: 0 }}>Blitz Mode</h3>
                <span style={{ padding: "4px 10px", background: "rgba(234,179,8,0.1)", color: "var(--warning)", borderRadius: 100, fontSize: "0.75rem", fontWeight: 800, textTransform: "uppercase" }}>Sweaty</span>
              </div>
              <p style={{ color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 16 }}>
                A relentless, sequential race. Both players start on Problem A. <strong>The first player to solve it locks it for the opponent</strong>, scoring the points. Both players are then immediately forced onto Problem B. Zero plot armor.
              </p>
              <ul style={{ color: "var(--text-muted)", fontSize: "0.95rem", lineHeight: 1.6, paddingLeft: 20 }}>
                <li>You cannot skip ahead or go back to previous problems. It's giving linear progression.</li>
                <li>If your opponent solves the problem while you are debugging, you fumbled and lose out on those points entirely.</li>
                <li>Fastest fingers win. Perfect for short, sweaty duels. Let him cook!</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Scoring */}
        <section id="scoring" style={{ scrollMarginTop: 100 }}>
          <h2 style={{ fontSize: "2rem", fontWeight: 800, color: "#FFFFFF", letterSpacing: "-0.02em", marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
            <Zap style={{ color: "var(--accent)" }} />
            Girl Math
          </h2>
          <p style={{ fontSize: "1.05rem", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 32 }}>
            When creating a duel, the host can choose between two different scoring metrics that determine how the winner is calculated. It's giving options.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div style={{ background: "rgba(255,255,255,0.02)", padding: 32, borderRadius: 24 }}>
              <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#FFFFFF", marginBottom: 12 }}>Points System</h3>
              <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", lineHeight: 1.6 }}>
                Problems are assigned escalating point values based on their Codeforces rating/difficulty (e.g., 100, 200, 300, 400).
                <br /><br />
                Solving harder problems rewards significantly more points (bussin!). The player with the most total points at the end gets the W.
              </p>
            </div>
            <div style={{ background: "rgba(255,255,255,0.02)", padding: 32, borderRadius: 24 }}>
              <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#FFFFFF", marginBottom: 12 }}>Accepted (AC) Count</h3>
              <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", lineHeight: 1.6 }}>
                Every problem is worth exactly 1 point, regardless of its difficulty.
                <br /><br />
                The player who solves the most problems overall wins. This mode favors speed and consistency across the board. TBH it's peak for tryhards.
              </p>
            </div>
          </div>

          <div style={{ marginTop: 24, display: "flex", gap: 16, background: "rgba(239,68,68,0.05)", padding: 24, borderRadius: 16 }}>
            <ShieldAlert style={{ width: 24, height: 24, color: "var(--danger)", flexShrink: 0 }} />
            <div>
              <h4 style={{ margin: "0 0 8px", color: "var(--danger)", fontWeight: 700 }}>Big Yikes</h4>
              <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.9rem", lineHeight: 1.6 }}>
                If both players end up with the same Score (or same AC count), the winner is determined by <strong>Penalty Time</strong>.
                Your penalty is the sum of the time (in minutes) it took you to solve each problem. Furthermore, every incorrect submission you made prior to a successful solve adds a flat <strong>20-minute penalty</strong> to your time! Massive L.
              </p>
            </div>
          </div>
        </section>

        {/* Rooms & Spectating */}
        <section id="rooms" style={{ scrollMarginTop: 100 }}>
          <h2 style={{ fontSize: "2rem", fontWeight: 800, color: "#FFFFFF", letterSpacing: "-0.02em", marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
            <Users style={{ color: "var(--accent)" }} />
            Main Character Energy
          </h2>
          <div style={{ background: "rgba(255,255,255,0.02)", padding: 32, borderRadius: 24 }}>
            <p style={{ color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 24 }}>
              Algorium is built to be social. Every duel takes place inside a dedicated "Room" which handles matchmaking, real-time codeforces sync, and live UI updates. Fr.
            </p>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <strong style={{ color: "#FFF", fontSize: "1.1rem" }}>Hard Launching your Room</strong>
                <p style={{ color: "var(--text-muted)", marginTop: 4, lineHeight: 1.5 }}>
                  Once you create a match, you'll be placed in a waiting lobby. A unique 6-character code (e.g. <code>X7B9K2</code>) will be generated. Send this code to your opp.
                </p>
              </div>
              <div>
                <strong style={{ color: "#FFF", fontSize: "1.1rem" }}>Spectator Mode</strong>
                <p style={{ color: "var(--text-muted)", marginTop: 4, lineHeight: 1.5 }}>
                  Anyone else who enters your room code will automatically join as a spectator (total NPC energy). Spectators get a live POV of the arena scoreboard, remaining time, and real-time popups whenever a player submits a solution or locks a problem. We listen and we don't judge.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Standings */}
        <section id="standings" style={{ scrollMarginTop: 100 }}>
          <h2 style={{ fontSize: "2rem", fontWeight: 800, color: "#FFFFFF", letterSpacing: "-0.02em", marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
            <Trophy style={{ color: "var(--accent)" }} />
            Aura Farming
          </h2>
          <div style={{ background: "rgba(255,255,255,0.02)", padding: 32, borderRadius: 24 }}>
            <p style={{ color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 24 }}>
              Just like Codeforces, Algorium features a rating system to measure your rizz in 1v1 formats.
            </p>
            <ul style={{ color: "var(--text-muted)", fontSize: "0.95rem", lineHeight: 1.6, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 12 }}>
              <li><strong>Rating Formula:</strong> We use an Elo-based system. Defeating higher-rated players grants more rating points than defeating lower-rated ones (Fanum tax).</li>
              <li><strong>Ranks:</strong> Your rank title updates automatically as your rating grows. Try to achieve the legendary <span style={{ color: "var(--danger)", fontWeight: 700 }}>Grandmaster</span> status and leave no crumbs!</li>
              <li><strong>Global Standings:</strong> Check the <code>/standings</code> page to see the GOATED duelists on the platform, ranked primarily by Wins, then by Rating. Highkey insane.</li>
            </ul>
          </div>
        </section>

      </main>
    </div>
  );
}
