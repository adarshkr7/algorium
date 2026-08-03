"use client";

import React, { useState } from "react";
import { KeyRound, Mail, ArrowRight, ShieldAlert, CheckCircle2 } from "lucide-react";
import Link from "next/link";

export default function ChangePasswordPage() {
  const [step, setStep] = useState<"request" | "reset" | "success">("request");
  const [handleOrEmail, setHandleOrEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handleOrEmail) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/users/forgot-password/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handleOrEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send OTP");
      setStep("reset");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || !newPassword) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/users/forgot-password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handleOrEmail, otp, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reset password");
      setStep("success");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 440, margin: "60px auto", padding: "20px" }}>
      <div className="neu-card-lg animate-fade-in-up" style={{ padding: "36px 40px" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div className="neu-icon" style={{ width: 64, height: 64, margin: "0 auto 20px" }}>
            <KeyRound style={{ width: 32, height: 32, color: "var(--accent)" }} />
          </div>
          <h1 style={{ fontWeight: 800, fontSize: "1.5rem", color: "var(--text-primary)", marginBottom: 8 }}>
            Change Password
          </h1>
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            {step === "request" && "Enter your handle or email to receive an OTP."}
            {step === "reset" && "Enter the OTP sent to your email and your new password."}
            {step === "success" && "Your password has been changed successfully!"}
          </p>
        </div>

        {error && (
          <div className="animate-shake" style={{
            display: "flex", alignItems: "flex-start", gap: "10px",
            padding: "12px 16px", borderRadius: "var(--r-md)",
            background: "var(--danger-soft)", marginBottom: "24px",
            boxShadow: "var(--neu-inset-sm)",
          }}>
            <ShieldAlert style={{ width: 15, height: 15, color: "var(--danger)", flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: "0.78rem", color: "var(--danger)", fontWeight: 600 }}>{error}</span>
          </div>
        )}

        {step === "request" && (
          <form onSubmit={handleRequestOtp} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div>
              <label className="neu-label" style={{ display: "block", marginBottom: "8px" }}>Handle or Email</label>
              <input
                type="text"
                placeholder="Enter handle or email..."
                value={handleOrEmail}
                onChange={(e) => setHandleOrEmail(e.target.value)}
                className="neu-input"
                required
                autoFocus
              />
            </div>
            <button type="submit" disabled={loading} className="neu-btn-primary neu-btn" style={{ padding: "14px", width: "100%", justifyContent: "center" }}>
              {loading ? "Sending..." : (
                <>
                  <Mail style={{ width: 16, height: 16 }} />
                  <span>Send OTP via Email</span>
                </>
              )}
            </button>
          </form>
        )}

        {step === "reset" && (
          <form onSubmit={handleResetPassword} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div>
              <label className="neu-label" style={{ display: "block", marginBottom: "8px" }}>6-Digit OTP</label>
              <input
                type="text"
                placeholder="Enter OTP..."
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className="neu-input"
                maxLength={6}
                required
                autoFocus
              />
            </div>
            <div>
              <label className="neu-label" style={{ display: "block", marginBottom: "8px" }}>New Password</label>
              <input
                type="password"
                placeholder="Enter new password..."
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="neu-input"
                minLength={6}
                required
              />
            </div>
            <button type="submit" disabled={loading} className="neu-btn-primary neu-btn" style={{ padding: "14px", width: "100%", justifyContent: "center" }}>
              {loading ? "Updating..." : (
                <>
                  <CheckCircle2 style={{ width: 16, height: 16 }} />
                  <span>Reset Password</span>
                </>
              )}
            </button>
            <button type="button" onClick={() => setStep("request")} className="neu-btn" style={{ padding: "10px", width: "100%", justifyContent: "center", fontSize: "0.8rem", border: "none", boxShadow: "none" }}>
              Back
            </button>
          </form>
        )}

        {step === "success" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px", alignItems: "center" }}>
            <Link href="/" className="neu-btn-primary neu-btn" style={{ padding: "14px 24px" }}>
              <span>Go to Home</span>
              <ArrowRight style={{ width: 16, height: 16 }} />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
