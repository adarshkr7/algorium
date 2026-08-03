import React from "react";
import { Mail, MessageSquare, Send } from "lucide-react";

export default function ContactPage() {
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
        <form style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div style={{ display: "flex", gap: "24px" }}>
            <div style={{ flex: 1 }}>
              <label className="neu-label" style={{ display: "block", marginBottom: "8px" }}>Name</label>
              <input type="text" className="neu-input" placeholder="Your Name" required />
            </div>
            <div style={{ flex: 1 }}>
              <label className="neu-label" style={{ display: "block", marginBottom: "8px" }}>Email</label>
              <input type="email" className="neu-input" placeholder="Your Email" required />
            </div>
          </div>
          <div>
            <label className="neu-label" style={{ display: "block", marginBottom: "8px" }}>Subject</label>
            <input type="text" className="neu-input" placeholder="What is this regarding?" required />
          </div>
          <div>
            <label className="neu-label" style={{ display: "block", marginBottom: "8px" }}>Message</label>
            <textarea className="neu-input" placeholder="Your message here..." rows={6} style={{ resize: "vertical" }} required></textarea>
          </div>
          <button type="submit" className="neu-btn-primary neu-btn" style={{ padding: "14px 28px", alignSelf: "flex-start" }}>
            <Send style={{ width: 16, height: 16 }} />
            <span>Send Message</span>
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
            <a href="mailto:support@algorium.com" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 700 }}>support@algorium.com</a>
          </div>
        </div>
      </div>
    </div>
  );
}
