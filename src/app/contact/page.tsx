"use client";

import React, { useState } from "react";
import { Mail, MessageSquare, Send } from "lucide-react";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !subject || !message) return;

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, message }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to send message");
      }

      setSuccess(true);
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "60px 20px" }}>
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <h1 style={{
          fontSize: "clamp(2.4rem, 6vw, 3.5rem)",
          fontWeight: 800,
          lineHeight: 1.1,
          color: "var(--text-primary)",
          marginBottom: 16,
          letterSpacing: "-0.04em",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 16
        }}>
          <MessageSquare style={{ width: 48, height: 48, color: "var(--accent)" }} />
          Contact Us
        </h1>
        <p style={{
          fontSize: "1.05rem",
          color: "var(--text-secondary)",
          maxWidth: 560,
          margin: "0 auto",
          lineHeight: 1.7,
        }}>
          Have a question, feedback, or found a bug? We'd love to hear from you.
        </p>
      </div>

      <div className="neu-card" style={{ padding: "40px" }}>
        {success && (
          <div style={{ padding: "16px", background: "var(--success)", color: "#fff", borderRadius: "var(--r-md)", marginBottom: "24px", textAlign: "center", fontWeight: 700 }}>
            Message sent successfully! We will get back to you soon.
          </div>
        )}
        {error && (
          <div style={{ padding: "16px", background: "var(--danger-soft)", color: "var(--danger)", borderRadius: "var(--r-md)", marginBottom: "24px", textAlign: "center", fontWeight: 700 }}>
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div style={{ display: "flex", gap: "24px" }}>
            <div style={{ flex: 1 }}>
              <label className="neu-label" style={{ display: "block", marginBottom: "8px" }}>Name</label>
              <input type="text" className="neu-input" placeholder="Your Name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div style={{ flex: 1 }}>
              <label className="neu-label" style={{ display: "block", marginBottom: "8px" }}>Email</label>
              <input type="email" className="neu-input" placeholder="Your Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
          </div>
          <div>
            <label className="neu-label" style={{ display: "block", marginBottom: "8px" }}>Subject</label>
            <input type="text" className="neu-input" placeholder="What is this regarding?" value={subject} onChange={(e) => setSubject(e.target.value)} required />
          </div>
          <div>
            <label className="neu-label" style={{ display: "block", marginBottom: "8px" }}>Message</label>
            <textarea className="neu-input" placeholder="Your message here..." rows={6} style={{ resize: "vertical" }} value={message} onChange={(e) => setMessage(e.target.value)} required></textarea>
          </div>
          <button type="submit" disabled={loading} className="neu-btn-primary neu-btn" style={{ padding: "14px 28px", alignSelf: "flex-start" }}>
            <Send style={{ width: 16, height: 16 }} />
            <span>{loading ? "Sending..." : "Send Message"}</span>
          </button>
        </form>
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: "40px", marginTop: "60px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", color: "var(--text-secondary)" }}>
          <div className="neu-icon" style={{ width: 40, height: 40 }}>
            <Mail style={{ width: 18, height: 18, color: "var(--text-primary)" }} />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--text-muted)" }}>Email Us</div>
            <a href="mailto:support.algorium@gmail.com" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 700 }}>support.algorium@gmail.com</a>
          </div>
        </div>
      </div>
    </div>
  );
}
