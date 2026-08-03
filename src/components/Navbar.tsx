"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Swords, User as UserIcon, LogOut, Zap,
  ShieldAlert, ExternalLink, RefreshCw,
  CheckCircle, Search, X,
} from "lucide-react";
import { useUser } from "@/context/UserContext";

type LoginStep = "handle" | "password" | "verify" | "register";

export const Navbar: React.FC = () => {
  const { user, setUser, logout } = useUser();
  const router = useRouter();

  const [handleInput, setHandleInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [passwordToken, setPasswordToken] = useState("");

  const [showLoginModal, setShowLoginModal] = useState(false);
  const [step, setStep] = useState<LoginStep>("handle");
  const [pendingHandle, setPendingHandle] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Profile search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchExpanded, setSearchExpanded] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  // Close search on outside click or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchExpanded(false);
        setSearchQuery("");
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSearchExpanded(false);
        setSearchQuery("");
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  const openSearch = () => {
    setSearchExpanded(true);
    setTimeout(() => searchInputRef.current?.focus(), 50);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    router.push(`/profile/${encodeURIComponent(q)}`);
    setSearchQuery("");
    setSearchExpanded(false);
  };


  const resetModal = () => {
    setStep("handle"); setHandleInput(""); setPasswordInput(""); setEmailInput("");
    setPendingHandle(""); setPasswordToken("");
    setToken(""); setError(null); setLoading(false);
  };
  const closeModal = () => { setShowLoginModal(false); resetModal(); };

  const handleInitiate = async (e: React.FormEvent, forceVerify = false) => {
    if (e) e.preventDefault();
    if (!handleInput.trim()) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/users/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: handleInput.trim(), forceVerify }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to initiate login");
      setPendingHandle(data.handle);
      if (data.step === "password") {
        setStep("password");
      } else {
        setToken(data.token);
        setStep("verify");
      }
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/users/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: pendingHandle, password: passwordInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Authentication failed");
      setUser(data.user); closeModal();
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
      setPasswordToken(data.passwordToken);
      setStep("register");
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim() || !passwordInput) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/users/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: pendingHandle, email: emailInput, password: passwordInput, passwordToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");
      setUser(data.user); closeModal();
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <>
      {/* ── Premium Glass Navbar ── */}
      <header style={{
        position: "sticky", top: 0, zIndex: 50,
        width: "100%",
        background: "rgba(9, 9, 11, 0.8)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--border)",
        padding: "0 24px",
        height: "64px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
      }}>
        {/* Logo */}
        <Link href="/" style={{ display: "flex", alignItems: "center", textDecoration: "none", flexShrink: 0 }}>
          <span style={{ fontWeight: 800, fontSize: "1.25rem", color: "var(--accent)", letterSpacing: "-0.02em" }}>
            ALGO<span style={{ color: "var(--text-secondary)" }}>RIUM</span>
          </span>
        </Link>

        {/* Right side: Standings, Contact, Search icon + Auth */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0, marginLeft: "auto" }}>

          <Link href="/standings" className="neu-btn" style={{ padding: "8px 14px", fontWeight: 600, fontSize: "0.85rem", textDecoration: "none", border: "none", background: "transparent", boxShadow: "none" }}>
            Standings
          </Link>
          <Link href="/contact" className="neu-btn" style={{ padding: "8px 14px", fontWeight: 600, fontSize: "0.85rem", textDecoration: "none", border: "none", background: "transparent", boxShadow: "none" }}>
            Contact
          </Link>


          {/* Collapsible search */}
          <div ref={searchRef} style={{ position: "relative", display: "flex", alignItems: "center" }}>
            {/* Animated search bar */}
            <div style={{
              display: "flex",
              alignItems: "center",
              overflow: "hidden",
              width: searchExpanded ? 240 : 0,
              opacity: searchExpanded ? 1 : 0,
              transition: "width 0.25s cubic-bezier(0.2,0.8,0.2,1), opacity 0.2s ease",
              marginRight: searchExpanded ? 6 : 0,
            }}>
              <form onSubmit={handleSearch} style={{ width: "100%" }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "var(--bg-hover)",
                  border: "1px solid var(--border-hover)",
                  borderRadius: "var(--r-pill)",
                  padding: "0 14px",
                  height: 38,
                  boxShadow: "0 0 0 3px rgba(250,250,250,0.05)",
                }}>
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search player..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      flex: 1,
                      background: "transparent",
                      border: "none",
                      outline: "none",
                      color: "var(--text-primary)",
                      fontSize: "0.82rem",
                      fontFamily: "inherit",
                      minWidth: 0,
                    }}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center" }}
                    >
                      <X style={{ width: 13, height: 13, color: "var(--text-muted)" }} />
                    </button>
                  )}
                </div>
              </form>
            </div>

            {/* Search icon button */}
            <button
              onClick={searchExpanded ? handleSearch as any : openSearch}
              className="neu-btn"
              style={{ padding: "10px", borderRadius: "50%" }}
              title="Search player profile"
            >
              <Search style={{ width: 16, height: 16 }} />
            </button>

            {/* Dropdown hint */}
            {searchExpanded && searchQuery.trim() && (
              <div
                onClick={handleSearch as any}
                style={{
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  right: 0,
                  minWidth: 260,
                  background: "var(--bg-subtle)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-md)",
                  padding: "10px 14px",
                  fontSize: "0.8rem",
                  color: "var(--text-secondary)",
                  boxShadow: "var(--shadow-md)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                  zIndex: 60,
                  whiteSpace: "nowrap",
                }}
              >
                <Search style={{ width: 13, height: 13, color: "var(--text-muted)", flexShrink: 0 }} />
                View profile of <strong style={{ color: "var(--text-primary)" }}>{searchQuery.trim()}</strong>
                <span style={{ marginLeft: "auto", fontSize: "0.7rem", color: "var(--text-muted)", fontFamily: "monospace" }}>↵</span>
              </div>
            )}
          </div>

          {user ? (
            <div 
              style={{ position: "relative", display: "inline-block" }}
              onMouseEnter={() => setShowDropdown(true)}
              onMouseLeave={() => setShowDropdown(false)}
            >
              <div
                style={{ padding: "4px", borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", border: "none", background: "transparent" }}
              >
                <img
                  src={user.avatar} alt={user.handle}
                  style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", boxShadow: "var(--shadow-sm)" }}
                />
              </div>
              
              {/* Dropdown Menu */}
              {showDropdown && (
                <div 
                  style={{ 
                    position: "absolute", top: "100%", right: 0, marginTop: "8px", 
                    background: "var(--bg-subtle)", border: "1px solid var(--border)", 
                    borderRadius: "var(--r-md)", padding: "8px",
                    boxShadow: "var(--shadow-md)", display: "flex", flexDirection: "column", gap: "4px",
                    minWidth: "160px", zIndex: 100
                  }}
                  className="animate-fade-in"
                >
                  <Link
                    href={`/profile/${encodeURIComponent(user.handle)}`}
                    className="neu-btn"
                    style={{ padding: "10px 14px", justifyContent: "flex-start", width: "100%", fontSize: "0.85rem", border: "none", boxShadow: "none" }}
                    onClick={() => setShowDropdown(false)}
                  >
                    <UserIcon style={{ width: 14, height: 14, marginRight: "8px" }} />
                    Open Profile
                  </Link>
                  <button 
                    onClick={() => { logout(); setShowDropdown(false); }} 
                    className="neu-btn" 
                    style={{ padding: "10px 14px", justifyContent: "flex-start", width: "100%", fontSize: "0.85rem", color: "var(--danger)", border: "none", boxShadow: "none" }}
                  >
                    <LogOut style={{ width: 14, height: 14, marginRight: "8px", color: "var(--danger)" }} />
                    Logout
                  </button>
                </div>
              )}
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
            background: "var(--modal-backdrop)",
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
            <div style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
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

              {/* Step: Password */}
              {step === "password" && (
                <form onSubmit={handleAuth} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                      <label className="neu-label" style={{ display: "block" }}>Password</label>
                      <button type="button" onClick={() => handleInitiate(undefined as any, true)} style={{ background: "none", border: "none", color: "var(--accent)", fontSize: "0.75rem", cursor: "pointer", textDecoration: "underline" }}>
                        Forgot Password?
                      </button>
                    </div>
                    <input
                      type="password"
                      placeholder="Enter your password..."
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      className="neu-input"
                      required autoFocus
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <button type="button" onClick={() => { setStep("handle"); setError(null); setPasswordInput(""); }} className="neu-btn" style={{ padding: "9px 16px", fontSize: "0.78rem" }}>
                      Back
                    </button>
                    <div style={{ display: "flex", gap: "10px" }}>
                      <button type="button" onClick={closeModal} className="neu-btn" style={{ padding: "10px 20px", fontSize: "0.82rem" }}>Cancel</button>
                      <button type="submit" disabled={loading} className="neu-btn-primary neu-btn" style={{ padding: "10px 24px", fontSize: "0.82rem" }}>
                        {loading ? "Logging in..." : "Log in"}
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {/* Step: CF Verify */}
              {step === "verify" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  <div className="neu-inset" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
                    <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
                      To prove ownership of <strong style={{ color: "var(--accent)" }}>{pendingHandle}</strong>, submit any code that results in a <strong style={{ color: "var(--danger)" }}>COMPILATION ERROR</strong> for problem <strong style={{ color: "var(--accent)" }}>{token}</strong>.
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
                      <a href={`https://codeforces.com/problemset/problem/${token.match(/^(\d+)/)?.[1]}/${token.match(/([A-Z]+)$/)?.[1]}`} target="_blank" rel="noopener noreferrer" className="neu-btn" style={{ padding: "12px", borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }} title="Go to Problem">
                        <ExternalLink style={{ width: 16, height: 16 }} />
                      </a>
                    </div>
                    <ol style={{ margin: 0, paddingLeft: "18px", fontSize: "0.77rem", color: "var(--text-secondary)", lineHeight: 1.8 }}>
                      <li>Click the icon above to open problem <strong>{token}</strong></li>
                      <li>Write gibberish (e.g. <code style={{ color: "var(--accent)" }}>compile errrr</code>) and Submit</li>
                      <li>Ensure you get a <strong>COMPILATION ERROR</strong></li>
                      <li>Click <strong>Verify</strong> below</li>
                    </ol>
                    <p style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace", margin: 0 }}>
                      Time limit: 5 minutes
                    </p>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <button onClick={() => { setStep("handle"); setError(null); }} className="neu-btn" style={{ padding: "9px 16px", fontSize: "0.78rem", gap: "6px" }}>
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

              {/* Step: Register */}
              {step === "register" && (
                <form onSubmit={handleRegister} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  <div>
                    <label className="neu-label" style={{ display: "block", marginBottom: "8px" }}>Email</label>
                    <input
                      type="email"
                      placeholder="Enter your email..."
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      className="neu-input"
                      style={{ marginBottom: "16px" }}
                      required autoFocus
                    />
                    <label className="neu-label" style={{ display: "block", marginBottom: "8px" }}>Set Password</label>
                    <input
                      type="password"
                      placeholder="Enter a new password..."
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      className="neu-input"
                      required
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                    <button type="submit" disabled={loading} className="neu-btn-primary neu-btn" style={{ padding: "10px 24px", fontSize: "0.82rem" }}>
                      {loading ? "Saving..." : "Create Account"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
