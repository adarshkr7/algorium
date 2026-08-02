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
    card: { padding: "28px 32px", marginBottom: 0 } as React.CSSProperties,
    label: { display: "block", marginBottom: 10 } as React.CSSProperties,
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      {/* Header */}
      <div className="animate-blur-reveal" style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 36 }}>
        <span className="neu-icon" style={{ width: 56, height: 56, background: "var(--bg-invert)", border: "none", flexShrink: 0 }}>
          <Swords style={{ width: 26, height: 26, color: "var(--text-invert)" }} />
        </span>
        <div>
          <h1 style={{ fontWeight: 800, fontSize: "1.8rem", color: "var(--text-primary)", margin: 0, letterSpacing: "-0.02em" }}>
            Create Contest Duel
          </h1>
          <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", margin: "4px 0 0" }}>
            Choose hosting mode, contest format, rating ranges, and problem filters
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="animate-shake" style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "14px 18px", borderRadius: "var(--r-md)",
          background: "var(--bg-subtle)",
          border: "1px solid var(--danger)",
          marginBottom: 24, fontSize: "0.85rem",
          color: "var(--danger)", fontWeight: 600,
        }}>
          <AlertTriangle style={{ width: 16, height: 16, flexShrink: 0 }} />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="stagger-children" style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Contest Name */}
        <div className="neu-card" style={S.card}>
          <label className="neu-label" style={S.label}>Contest Name</label>
          <input
            type="text" value={name}
            onChange={(e) => setName(e.target.value)}
            className="neu-input" required
            style={{ fontWeight: 600 }}
          />
        </div>

        {/* HOSTING TYPE SELECTOR */}
        <div className="neu-card" style={S.card}>
          <label className="neu-label" style={S.label}>Hosting Type</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {([
              {
                id: "PLAYER_HOST",
                label: "Player Host (1v1)",
                desc: "You host and compete directly against an invited opponent.",
                icon: <Swords style={{ width: 20, height: 20, color: hostingType === "PLAYER_HOST" ? "#fff" : "var(--accent)" }} />,
                color: "var(--accent)", glow: "var(--accent-glow)",
              },
              {
                id: "SUPERVISED",
                label: "Supervised Match",
                desc: "You create & supervise a 1v1 duel between 2 invited contestants.",
                icon: <Eye style={{ width: 20, height: 20, color: hostingType === "SUPERVISED" ? "#fff" : "var(--warning)" }} />,
                color: "var(--warning)", glow: "rgba(245,158,11,0.3)",
              },
            ] as const).map((h) => (
              <button
                key={h.id} type="button"
                onClick={() => setHostingType(h.id)}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 12,
                  padding: "18px 20px", borderRadius: "var(--r-md)",
                  cursor: "pointer", textAlign: "left",
                  transition: "all var(--t-base)",
                  background: "transparent",
                  border: `1px solid ${hostingType === h.id ? "var(--text-primary)" : "var(--border)"}`,
                  color: hostingType === h.id ? "var(--text-primary)" : "var(--text-secondary)",
                }}
              >
                <span className="neu-icon" style={{
                  width: 38, height: 38, flexShrink: 0,
                  background: hostingType === h.id ? "var(--bg-hover)" : "var(--bg-subtle)",
                  border: hostingType === h.id ? "none" : "1px solid var(--border)",
                }}>
                  {h.icon}
                </span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: 4, color: "var(--text-primary)" }}>
                    {h.label}
                  </div>
                  <div style={{ fontSize: "0.75rem", lineHeight: 1.5 }}>{h.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Mode Selector */}
        <div className="neu-card" style={S.card}>
          <label className="neu-label" style={S.label}>Contest Mode</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {([
              {
                id: "BLITZ", label: "Blitz Mode",
                desc: "Sequential unlock race. Permanent lock on solve!",
                icon: <Zap style={{ width: 20, height: 20, color: mode === "BLITZ" ? "#fff" : "var(--success)" }} />,
                color: "var(--success)", glow: "rgba(34,197,94,0.25)",
              },
              {
                id: "CLASSIC", label: "Classic Duel",
                desc: "All problems open. Ranked by AC & penalty time.",
                icon: <Shield style={{ width: 20, height: 20, color: mode === "CLASSIC" ? "#fff" : "var(--accent)" }} />,
                color: "var(--accent)", glow: "var(--accent-glow)",
              },
            ] as const).map((m) => (
              <button
                key={m.id} type="button"
                onClick={() => setMode(m.id)}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 12,
                  padding: "18px 20px", borderRadius: "var(--r-md)",
                  cursor: "pointer", textAlign: "left",
                  transition: "all var(--t-base)",
                  background: "transparent",
                  border: `1px solid ${mode === m.id ? "var(--text-primary)" : "var(--border)"}`,
                  color: mode === m.id ? "var(--text-primary)" : "var(--text-secondary)",
                }}
              >
                <span className="neu-icon" style={{
                  width: 38, height: 38, flexShrink: 0,
                  background: mode === m.id ? "var(--bg-hover)" : "var(--bg-subtle)",
                  border: mode === m.id ? "none" : "1px solid var(--border)",
                }}>
                  {m.icon}
                </span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: 4, color: "var(--text-primary)" }}>
                    {m.label}
                  </div>
                  <div style={{ fontSize: "0.75rem", lineHeight: 1.5 }}>{m.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Problem Count & Duration */}
        <div className="neu-card" style={S.card}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div>
              <label className="neu-label" style={{ ...S.label, display: "flex", alignItems: "center", gap: 6 }}>
                <Hash style={{ width: 12, height: 12, color: "var(--success)" }} /> Number of Problems
              </label>
              <select value={problemCount} onChange={(e) => handleProblemCountChange(Number(e.target.value))}
                className="neu-input neu-select font-mono">
                <option value={1}>1 Problem (Speed Duel)</option>
                <option value={2}>2 Problems</option>
                <option value={3}>3 Problems (Recommended)</option>
                <option value={4}>4 Problems</option>
                <option value={5}>5 Problems (Full Contest)</option>
              </select>
            </div>
            <div>
              <label className="neu-label" style={{ ...S.label, display: "flex", alignItems: "center", gap: 6 }}>
                <Clock style={{ width: 12, height: 12, color: "var(--accent)" }} /> Duration (Minutes)
              </label>
              <select value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="neu-input neu-select font-mono">
                <option value={15}>15 Minutes</option>
                <option value={30}>30 Minutes</option>
                <option value={45}>45 Minutes</option>
                <option value={60}>60 Minutes</option>
              </select>
            </div>
          </div>
        </div>

        {/* Rating Configuration */}
        <div className="neu-card" style={S.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <label className="neu-label" style={{ display: "flex", alignItems: "center", gap: 6, margin: 0 }}>
              <Sliders style={{ width: 12, height: 12, color: "var(--warning)" }} /> Rating Selection
            </label>
            <div style={{ display: "flex", background: "var(--neu-bg)", padding: 4, borderRadius: "var(--r-md)", gap: 4 }}>
              <button type="button" onClick={() => setRatingMode("RANGE")} className={ratingMode === "RANGE" ? "neu-btn-primary neu-btn" : "neu-btn"} style={{ padding: "4px 12px", fontSize: "0.75rem", border: "none" }}>Range</button>
              <button type="button" onClick={() => setRatingMode("EXACT")} className={ratingMode === "EXACT" ? "neu-btn-primary neu-btn" : "neu-btn"} style={{ padding: "4px 12px", fontSize: "0.75rem", border: "none" }}>Exact</button>
            </div>
          </div>
          
          {ratingMode === "RANGE" ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <span className="neu-label" style={{ display: "block", marginBottom: 6 }}>Min Rating</span>
                <input type="number" step={100} min={800} max={3500} value={minRating}
                  onChange={(e) => setMinRating(Number(e.target.value))}
                  className="neu-input font-mono" />
              </div>
              <div>
                <span className="neu-label" style={{ display: "block", marginBottom: 6 }}>Max Rating</span>
                <input type="number" step={100} min={800} max={3500} value={maxRating}
                  onChange={(e) => setMaxRating(Number(e.target.value))}
                  className="neu-input font-mono" />
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: problemCount > 3 ? "1fr 1fr" : "1fr", gap: 12 }}>
              {exactRatings.map((rating, idx) => (
                <div key={idx} style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--neu-bg)", padding: "10px 14px", borderRadius: "var(--r-md)", boxShadow: "var(--neu-inset-sm)" }}>
                  <span className="font-mono" style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 700, width: 24 }}>P{idx + 1}</span>
                  <input type="range" min={800} max={3500} step={100} value={rating}
                    onChange={(e) => {
                      const newRatings = [...exactRatings];
                      newRatings[idx] = Number(e.target.value);
                      setExactRatings(newRatings);
                    }}
                    style={{ flex: 1, accentColor: "var(--accent)" }}
                  />
                  <span className="font-mono" style={{ fontSize: "0.85rem", color: "var(--accent)", fontWeight: 700, width: 44, textAlign: "right" }}>
                    {rating}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Allowed Tags */}
        <div className="neu-card" style={S.card}>
          <label className="neu-label" style={{ ...S.label, display: "flex", alignItems: "center", gap: 6 }}>
            <Tag style={{ width: 12, height: 12, color: "var(--success)" }} /> Allowed Tags
          </label>
          <div className="neu-inset" style={{ padding: "14px", display: "flex", flexWrap: "wrap", gap: 8, maxHeight: 160, overflowY: "auto" }}>
            {POPULAR_TAGS.map((tag) => (
              <button
                key={tag} type="button" onClick={() => toggleAllowedTag(tag)}
                className={`neu-tag ${selectedAllowedTags.includes(tag) ? "neu-tag-selected-green" : ""}`}
              >
                {tag} {selectedAllowedTags.includes(tag) && "✓"}
              </button>
            ))}
          </div>
        </div>

        {/* Excluded Tags */}
        <div className="neu-card" style={S.card}>
          <label className="neu-label" style={{ ...S.label, display: "flex", alignItems: "center", gap: 6 }}>
            <Tag style={{ width: 12, height: 12, color: "var(--danger)" }} /> Excluded Tags (Optional)
          </label>
          <div className="neu-inset" style={{ padding: "14px", display: "flex", flexWrap: "wrap", gap: 8, maxHeight: 130, overflowY: "auto" }}>
            {POPULAR_TAGS.map((tag) => (
              <button
                key={`ex-${tag}`} type="button" onClick={() => toggleExcludedTag(tag)}
                className={`neu-tag ${selectedExcludedTags.includes(tag) ? "neu-tag-selected-red" : ""}`}
              >
                {tag} {selectedExcludedTags.includes(tag) && "✕"}
              </button>
            ))}
          </div>
        </div>

        {/* Seed */}
        <div className="neu-card" style={S.card}>
          <label className="neu-label" style={S.label}>Random Seed (Optional)</label>
          <input
            type="text"
            placeholder="Leave empty for auto-generated seed"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            className="neu-input font-mono"
          />
        </div>

        {/* Submit */}
        <button
          type="submit" disabled={loading}
          className="neu-btn-primary neu-btn"
          style={{ width: "100%", padding: "18px 28px", fontSize: "1rem", borderRadius: "var(--r-md)" }}
        >
          {loading ? (
            <span>Generating Official Codeforces Problems...</span>
          ) : (
            <>
              <Sparkles style={{ width: 18, height: 18 }} />
              <span>Generate Contest & Create Room</span>
              <ArrowRight style={{ width: 18, height: 18 }} />
            </>
          )}
        </button>
      </form>
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
