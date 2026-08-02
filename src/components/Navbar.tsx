"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Swords, User as UserIcon, LogOut, Zap, Trophy,
  ShieldAlert, Copy, CheckCircle, ExternalLink, RefreshCw,
} from "lucide-react";
import { useUser } from "@/context/UserContext";

type LoginStep = "handle" | "verify";

export const Navbar: React.FC = () => {
  const { user, setUser, logout } = useUser();
  const [handleInput, setHandleInput] = useState("");
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [step, setStep] = useState<LoginStep>("handle");
  const [pendingHandle, setPendingHandle] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const resetModal = () => {
    setStep("handle"); setHandleInput(""); setPendingHandle("");
    setToken(""); setError(null); setCopied(false); setLoading(false);
  };
  const closeModal = () => { setShowLoginModal(false); resetModal(); };

  const handleInitiate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handleInput.trim()) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/users/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: handleInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to initiate login");
      setPendingHandle(data.handle); setToken(data.token); setStep("verify");
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleVerify = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/users/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: pendingHandle }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed");
      setUser(data.user); closeModal();
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const copyToken = () => {
    navigator.clipboard.writeText(token).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <>
      {/* ── Floating Pill Navbar ── */}
      <header style={{
        position: "sticky", top: "12px", zIndex: 50,
        maxWidth: "1140px", width: "calc(100% - 32px)",
        margin: "12px auto 0",
        background: "var(--neu-card)",
        borderRadius: "var(--r-xl)",
        boxShadow: "var(--neu-shadow)",
        padding: "12px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: "16px",
      }}>
        {/* Logo */}
        <Link href="/" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
          <span style={{ fontWeight: 800, fontSize: "1.25rem", color: "var(--accent)", letterSpacing: "-0.02em" }}>
            ALGO<span style={{ color: "var(--text-primary)" }}>RIUM</span>
          </span>
        </Link>

        {/* Nav links */}
        <nav style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {user && (
            <Link
              href={`/profile/${encodeURIComponent(user.handle)}`}
              className="neu-btn"
              style={{ padding: "8px 18px", fontSize: "0.8rem" }}
            >
              <Trophy style={{ width: 14, height: 14, color: "var(--warning)" }} />
              <span>My Stats</span>
            </Link>
          )}
        </nav>

        {/* Auth */}
        <div>
          {user ? (
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <Link
                href={`/profile/${encodeURIComponent(user.handle)}`}
                className="neu-btn"
                style={{ padding: "8px 14px", gap: "10px" }}
              >
                <img
                  src={user.avatar} alt={user.handle}
                  style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", boxShadow: "var(--neu-shadow-sm)" }}
                />
                <span style={{ fontSize: "0.8rem" }}>{user.handle}</span>
              </Link>
              <button onClick={logout} className="neu-btn" style={{ padding: "10px", borderRadius: "50%" }} title="Sign Out">
                <LogOut style={{ width: 16, height: 16, color: "var(--danger)" }} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => { resetModal(); setShowLoginModal(true); }}
              className="neu-btn-primary neu-btn"
              style={{ padding: "10px 22px", fontSize: "0.85rem" }}
            >
              <UserIcon style={{ width: 15, height: 15 }} />
              Sign In with CF
            </button>
          )}
        </div>
      </header>

      {/* ── Login Modal ── */}
      {showLoginModal && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
          style={{
            position: "fixed", inset: 0, zIndex: 100,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(233,238,245,0.85)",
            backdropFilter: "blur(8px)",
            padding: "20px",
          }}
          className="animate-fade-in"
        >
          <div
            className="neu-card-lg animate-scale-in"
            style={{ width: "100%", maxWidth: 440, overflow: "hidden" }}
          >
            {/* Step indicator */}
            <div style={{ display: "flex", borderBottom: "1px solid var(--shadow-dark)" }}>
              {(["handle", "verify"] as const).map((s, i) => (
                <div
                  key={s}
                  style={{
                    flex: 1, padding: "12px", textAlign: "center",
                    fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.06em",
                    textTransform: "uppercase", fontFamily: "JetBrains Mono, monospace",
                    color: step === s ? "var(--accent)" : "var(--text-muted)",
                    background: step === s ? "var(--accent-glow)" : "transparent",
                    transition: "all var(--t-base)",
                  }}
                >
                  {i + 1}. {s === "handle" ? "Enter Handle" : "Verify Ownership"}
                </div>
              ))}
            </div>

            <div style={{ padding: "28px 32px 32px" }}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "24px" }}>
                <span className="neu-icon neu-btn-primary" style={{ width: 44, height: 44 }}>
                  <Swords style={{ width: 20, height: 20 }} />
                </span>
                <div>
                  <h3 style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--text-primary)", margin: 0 }}>Sign in to Algorium</h3>
                  <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: "2px 0 0" }}>
                    {step === "handle" ? "Enter your Codeforces handle" : `Proving ownership of ${pendingHandle}`}
                  </p>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="animate-shake" style={{
                  display: "flex", alignItems: "flex-start", gap: "10px",
                  padding: "12px 16px", borderRadius: "var(--r-md)",
                  background: "var(--danger-soft)", marginBottom: "20px",
                  boxShadow: "var(--neu-inset-sm)",
                }}>
                  <ShieldAlert style={{ width: 15, height: 15, color: "var(--danger)", flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: "0.78rem", color: "var(--danger)", fontWeight: 600 }}>{error}</span>
                </div>
              )}

              {/* Step 1 */}
              {step === "handle" && (
                <form onSubmit={handleInitiate} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  <div>
                    <label className="neu-label" style={{ display: "block", marginBottom: "8px" }}>Codeforces Handle</label>
                    <input
                      type="text"
                      placeholder="e.g. tourist, Benq, Adarsh..."
                      value={handleInput}
                      onChange={(e) => setHandleInput(e.target.value)}
                      className="neu-input"
                      required autoFocus
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                    <button type="button" onClick={closeModal} className="neu-btn" style={{ padding: "10px 20px", fontSize: "0.82rem" }}>
                      Cancel
                    </button>
                    <button type="submit" disabled={loading} className="neu-btn-primary neu-btn" style={{ padding: "10px 24px", fontSize: "0.82rem" }}>
                      {loading ? "Checking..." : <><Zap style={{ width: 14, height: 14 }} /> Continue</>}
                    </button>
                  </div>
                </form>
              )}

              {/* Step 2 */}
              {step === "verify" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  <div className="neu-inset" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
                    <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
                      To prove ownership of <strong style={{ color: "var(--accent)" }}>{pendingHandle}</strong>, set your
                      Codeforces <strong style={{ color: "var(--text-primary)" }}>First Name</strong> to this token:
                    </p>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <div className="neu-inset-sm" style={{
                        flex: 1, padding: "12px 16px", textAlign: "center",
                        fontFamily: "JetBrains Mono, monospace",
                        fontSize: "1.4rem", fontWeight: 700, letterSpacing: "0.12em",
                        color: "var(--accent)",
                      }}>
                        {token}
                      </div>
                      <button onClick={copyToken} className="neu-btn" style={{ padding: "12px", borderRadius: "50%", flexShrink: 0 }}>
                        {copied
                          ? <CheckCircle style={{ width: 16, height: 16, color: "var(--success)" }} />
                          : <Copy style={{ width: 16, height: 16 }} />
                        }
                      </button>
                    </div>
                    <ol style={{ margin: 0, paddingLeft: "18px", fontSize: "0.77rem", color: "var(--text-secondary)", lineHeight: 1.8 }}>
                      <li>Copy the token above</li>
                      <li>
                        Open{" "}
                        <a href="https://codeforces.com/settings/general" target="_blank" rel="noopener noreferrer"
                          style={{ color: "var(--accent)", textDecoration: "underline", display: "inline-flex", alignItems: "center", gap: 3 }}>
                          CF Settings <ExternalLink style={{ width: 10, height: 10 }} />
                        </a>
                      </li>
                      <li>Paste in <strong>First name</strong> field and Save</li>
                      <li>Click <strong>Verify</strong> below — then revert your name ✓</li>
                    </ol>
                    <p style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace", margin: 0 }}>
                      Token expires in 10 minutes
                    </p>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <button
                      onClick={() => { setStep("handle"); setError(null); }}
                      className="neu-btn"
                      style={{ padding: "9px 16px", fontSize: "0.78rem", gap: "6px" }}
                    >
                      <RefreshCw style={{ width: 13, height: 13 }} /> Start over
                    </button>
                    <div style={{ display: "flex", gap: "10px" }}>
                      <button onClick={closeModal} className="neu-btn" style={{ padding: "10px 18px", fontSize: "0.82rem" }}>Cancel</button>
                      <button onClick={handleVerify} disabled={loading} className="neu-btn-primary neu-btn" style={{ padding: "10px 24px", fontSize: "0.82rem" }}>
                        {loading ? "Verifying..." : <><CheckCircle style={{ width: 14, height: 14 }} /> Verify</>}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
