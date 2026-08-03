"use client";

import React, { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Swords, Zap, Shield, Sparkles, Hash, Clock, Tag, ArrowRight, AlertTriangle, Sliders, Eye, UserCheck } from "lucide-react";
import { useUser } from "@/context/UserContext";

const POPULAR_TAGS = [
  "implementation","math","greedy","dp","data structures","brute force",
  "constructive algorithms","graphs","sortings","binary search","dfs and similar",
  "trees","strings","number theory","two pointers","bitmasks","combinatorics","geometry",
];

function CreateContestPageInner() {
  const { user } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode = searchParams.get("mode") === "CLASSIC" ? "CLASSIC" : "BLITZ";

  const [name, setName] = useState("Algorium Match");
  const [hostingType, setHostingType] = useState<"PLAYER_HOST" | "SUPERVISED">("PLAYER_HOST");
  const [mode, setMode] = useState<"BLITZ" | "CLASSIC">(initialMode);
  const [problemCount, setProblemCount] = useState(3);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [ratingMode, setRatingMode] = useState<"RANGE" | "EXACT">("RANGE");
  const [minRating, setMinRating] = useState(800);
  const [maxRating, setMaxRating] = useState(1600);
  const [exactRatings, setExactRatings] = useState<number[]>([800, 1000, 1200]);
  const [selectedAllowedTags, setSelectedAllowedTags] = useState<string[]>(["implementation","math"]);
  const [selectedExcludedTags, setSelectedExcludedTags] = useState<string[]>([]);
  const [seed, setSeed] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleAllowedTag = (tag: string) =>
    setSelectedAllowedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);

  const toggleExcludedTag = (tag: string) =>
    setSelectedExcludedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);

  const handleProblemCountChange = (count: number) => {
    setProblemCount(count);
    setExactRatings(prev => {
      const next = [...prev];
      if (count > next.length) {
        const lastVal = next.length > 0 ? next[next.length - 1] : 1200;
        while (next.length < count) {
          next.push(Math.min(3500, lastVal + 100)); // pad with increasing rating
        }
      } else {
        next.length = count;
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { setError("Please sign in with your Codeforces handle before creating a contest."); return; }
    if (minRating > maxRating) { setError("Minimum rating cannot exceed maximum rating."); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/contests/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostId: user.id,
          hostHandle: user.handle,
          name,
          mode,
          hostingType,
          problemCount,
          durationMinutes,
          minRating,
          maxRating,
          ratings: ratingMode === "EXACT" ? exactRatings : undefined,
          allowedTags: selectedAllowedTags,
          excludedTags: selectedExcludedTags,
          seed,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create contest");
      router.push(`/room/${data.room.code}`);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const S = {
    card: { marginBottom: 48 } as React.CSSProperties,
    label: { display: "block", marginBottom: 12, fontSize: "0.65rem", color: "var(--text-muted)", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase" as any } as React.CSSProperties,
    unselectedBtn: { display: "flex", flexDirection: "column" as any, gap: 6, background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", padding: "16px 20px", color: "var(--text-secondary)", cursor: "pointer", transition: "all 0.2s", textAlign: "left" as any, flex: 1 } as React.CSSProperties,
    selectedBtn: { display: "flex", flexDirection: "column" as any, gap: 6, background: "#FFFFFF", border: "1px solid #FFFFFF", borderRadius: "12px", padding: "16px 20px", color: "#000000", cursor: "pointer", transition: "all 0.2s", textAlign: "left" as any, flex: 1 } as React.CSSProperties,
    bigInput: { background: "transparent", border: "none", borderBottom: "2px solid #222", color: "#FFFFFF", fontSize: "1.8rem", fontWeight: 700, padding: "4px 0", outline: "none", width: "100%", letterSpacing: "-0.02em", transition: "border-color 0.3s" } as React.CSSProperties,
  };

  return (
    <div style={{ position: "fixed", top: 64, left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", overflow: "hidden", padding: "40px" }}>
      <div style={{ maxWidth: 1100, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", height: "100%" }}>
        
        {/* Main Heading Always on Top */}
        <div style={{ flexShrink: 0 }}>
          <h1 style={{ fontWeight: 800, fontSize: "3.5rem", color: "#FFFFFF", margin: "0 0 40px", letterSpacing: "-0.05em", lineHeight: 1 }}>
            Create Duel.
          </h1>
          {error && (
            <div className="animate-shake" style={{ color: "var(--danger)", fontSize: "0.9rem", fontWeight: 600, marginBottom: 20 }}>
              {error}
            </div>
          )}
        </div>

        {/* Scrollable Form Area */}
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", paddingRight: 20 }} id="create-contest-form">
          
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 80px" }}>
            
            {/* Left Column Settings */}
            <div style={{ display: "flex", flexDirection: "column" }}>
              {/* Contest Name */}
              <div style={S.card}>
                <label style={S.label}>Duel Name</label>
                <input
                  type="text" value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={S.bigInput} required
                  onFocus={(e) => e.target.style.borderColor = "#FFFFFF"}
                  onBlur={(e) => e.target.style.borderColor = "#222"}
                />
              </div>

              {/* HOSTING TYPE SELECTOR */}
              <div style={S.card}>
                <label style={S.label}>Role</label>
                <div style={{ position: "relative", display: "flex", background: "#000000", border: "none", borderRadius: "100px", padding: 6, marginBottom: 12 }}>
                  <div style={{
                    position: "absolute", top: 6, bottom: 6, left: hostingType === "PLAYER_HOST" ? 6 : "calc(50% + 3px)",
                    width: "calc(50% - 9px)", background: "#FFFFFF", borderRadius: "100px",
                    transition: "left 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
                  }} />
                  
                  <button type="button" onClick={() => setHostingType("PLAYER_HOST")} 
                    style={{ position: "relative", zIndex: 1, flex: 1, background: "none", border: "none", padding: "12px", 
                             fontSize: "1.1rem", fontWeight: 700, color: hostingType === "PLAYER_HOST" ? "#000" : "var(--text-secondary)", cursor: "pointer", transition: "color 0.3s" }}>
                    Player
                  </button>
                  
                  <button type="button" onClick={() => setHostingType("SUPERVISED")} 
                    style={{ position: "relative", zIndex: 1, flex: 1, background: "none", border: "none", padding: "12px", 
                             fontSize: "1.1rem", fontWeight: 700, color: hostingType === "SUPERVISED" ? "#000" : "var(--text-secondary)", cursor: "pointer", transition: "color 0.3s" }}>
                    Supervisor
                  </button>
                </div>
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: 0, height: 16 }}>
                  {hostingType === "PLAYER_HOST" ? "Compete directly against an opponent." : "Watch two players compete in your duel."}
                </p>
              </div>

              {/* Mode Selector */}
              <div style={{ ...S.card, marginBottom: 0 }}>
                <label style={S.label}>Mode</label>
                <div style={{ position: "relative", display: "flex", background: "#000000", border: "none", borderRadius: "100px", padding: 6, marginBottom: 12 }}>
                  <div style={{
                    position: "absolute", top: 6, bottom: 6, left: mode === "BLITZ" ? 6 : "calc(50% + 3px)",
                    width: "calc(50% - 9px)", background: "#FFFFFF", borderRadius: "100px",
                    transition: "left 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
                  }} />
                  
                  <button type="button" onClick={() => setMode("BLITZ")} 
                    style={{ position: "relative", zIndex: 1, flex: 1, background: "none", border: "none", padding: "12px", 
                             fontSize: "1.1rem", fontWeight: 700, color: mode === "BLITZ" ? "#000" : "var(--text-secondary)", cursor: "pointer", transition: "color 0.3s" }}>
                    Blitz
                  </button>
                  
                  <button type="button" onClick={() => setMode("CLASSIC")} 
                    style={{ position: "relative", zIndex: 1, flex: 1, background: "none", border: "none", padding: "12px", 
                             fontSize: "1.1rem", fontWeight: 700, color: mode === "CLASSIC" ? "#000" : "var(--text-secondary)", cursor: "pointer", transition: "color 0.3s" }}>
                    Classic
                  </button>
                </div>
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: 0, height: 16 }}>
                  {mode === "BLITZ" ? "Linear race. Lock on solve." : "ICPC style with penalty time."}
                </p>
              </div>
            </div>

            {/* Right Column Settings */}
            <div style={{ display: "flex", flexDirection: "column" }}>
              {/* Problem Count & Duration */}
              <div style={S.card}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40 }}>
                  <div>
                    <label style={S.label}>Problems</label>
                    <select value={problemCount} onChange={(e) => handleProblemCountChange(Number(e.target.value))}
                      style={{ ...S.bigInput, appearance: "none", cursor: "pointer" }}>
                      {[1,2,3,4,5].map(n => <option key={n} value={n} style={{ background: "#000", fontSize: "1rem" }}>{n}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={S.label}>Duration</label>
                    <select value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))}
                      style={{ ...S.bigInput, appearance: "none", cursor: "pointer" }}>
                      <option value={15} style={{ background: "#000", fontSize: "1rem" }}>15m</option>
                      <option value={30} style={{ background: "#000", fontSize: "1rem" }}>30m</option>
                      <option value={45} style={{ background: "#000", fontSize: "1rem" }}>45m</option>
                      <option value={60} style={{ background: "#000", fontSize: "1rem" }}>60m</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Rating Configuration */}
              <div style={S.card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                  <label style={{ ...S.label, marginBottom: 0 }}>Rating</label>
                  <div style={{ display: "flex", gap: 16 }}>
                    <button type="button" onClick={() => setRatingMode("RANGE")} style={{ background: "none", border: "none", padding: 0, fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: ratingMode === "RANGE" ? "#FFFFFF" : "#444", cursor: "pointer" }}>Range</button>
                    <button type="button" onClick={() => setRatingMode("EXACT")} style={{ background: "none", border: "none", padding: 0, fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: ratingMode === "EXACT" ? "#FFFFFF" : "#444", cursor: "pointer" }}>Exact</button>
                  </div>
                </div>
                
                {ratingMode === "RANGE" ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                    <input type="number" step={100} min={800} max={3500} value={minRating} onChange={(e) => setMinRating(Number(e.target.value))}
                      style={{ ...S.bigInput, width: "100px", textAlign: "center" }} onFocus={(e) => e.target.style.borderColor = "#FFFFFF"} onBlur={(e) => e.target.style.borderColor = "#222"} />
                    <span style={{ fontSize: "1.8rem", color: "#444", fontWeight: 700 }}>—</span>
                    <input type="number" step={100} min={800} max={3500} value={maxRating} onChange={(e) => setMaxRating(Number(e.target.value))}
                      style={{ ...S.bigInput, width: "100px", textAlign: "center" }} onFocus={(e) => e.target.style.borderColor = "#FFFFFF"} onBlur={(e) => e.target.style.borderColor = "#222"} />
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {exactRatings.map((rating, idx) => (
                      <div key={idx} style={{ display: "flex", alignItems: "center", gap: 20 }}>
                        <span style={{ fontSize: "1rem", color: "#444", fontWeight: 700 }}>P{idx + 1}</span>
                        <input type="range" min={800} max={3500} step={100} value={rating}
                          onChange={(e) => {
                            const newRatings = [...exactRatings];
                            newRatings[idx] = Number(e.target.value);
                            setExactRatings(newRatings);
                          }}
                          style={{ flex: 1, accentColor: "#FFFFFF", height: 2, background: "#222", appearance: "none", cursor: "pointer" }}
                        />
                        <span style={{ fontSize: "1.4rem", color: "#FFFFFF", fontWeight: 700, width: 60, textAlign: "right" }}>{rating}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Tags */}
              <div style={{ ...S.card, marginBottom: 0 }}>
                <label style={S.label}>Tags</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {POPULAR_TAGS.map((tag) => {
                    const isAllowed = selectedAllowedTags.includes(tag);
                    const isExcluded = selectedExcludedTags.includes(tag);
                    return (
                      <button
                        key={tag} type="button" 
                        onClick={() => {
                          if (isAllowed) { toggleAllowedTag(tag); toggleExcludedTag(tag); }
                          else if (isExcluded) { toggleExcludedTag(tag); }
                          else { toggleAllowedTag(tag); }
                        }}
                        style={{ 
                          background: isAllowed ? "#FFFFFF" : isExcluded ? "var(--danger)" : "transparent",
                          border: `1px solid ${isAllowed ? "#FFFFFF" : isExcluded ? "var(--danger)" : "rgba(255,255,255,0.15)"}`,
                          color: isAllowed ? "#000" : isExcluded ? "#FFF" : "var(--text-secondary)",
                          padding: "6px 14px", borderRadius: "100px", fontSize: "0.85rem", fontWeight: 500, cursor: "pointer", transition: "all 0.2s"
                        }}
                      >
                        {tag}
                      </button>
                    )
                  })}
                </div>
                <p style={{ fontSize: "0.65rem", color: "#555", marginTop: 12, textTransform: "uppercase", letterSpacing: "0.1em" }}>Click once to allow, twice to exclude</p>
              </div>
            </div>

          </div>

          {/* Submit */}
          <div style={{ marginTop: 40, paddingBottom: 40 }}>
            <button
              type="submit" disabled={loading}
              style={{ 
                background: "#FFFFFF", color: "#000000", width: "100%", padding: "24px", 
                fontSize: "1.2rem", fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase",
                border: "none", cursor: loading ? "not-allowed" : "pointer", transition: "opacity 0.2s", opacity: loading ? 0.7 : 1
              }}
            >
              {loading ? "Generating..." : "Create"}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}

export default function CreateContestPage() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div className="neu-card" style={{ padding: "32px 48px", textAlign: "center" }}>
          <p className="font-mono" style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Loading contest form...</p>
        </div>
      </div>
    }>
      <CreateContestPageInner />
    </Suspense>
  );
}
