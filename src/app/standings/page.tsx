import React from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Trophy, Medal, ArrowRight } from "lucide-react";

export const revalidate = 60; // Revalidate every minute

export default async function StandingsPage() {
  const users = await prisma.user.findMany({
    orderBy: [
      { wins: 'desc' },
      { rating: 'desc' },
      { handle: 'asc' }
    ],
    take: 100 // Limit to top 100 for now
  });

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 20px" }}>
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
          <Trophy style={{ width: 48, height: 48, color: "var(--accent)" }} />
          Global Standings
        </h1>
        <p style={{
          fontSize: "1.05rem",
          color: "var(--text-secondary)",
          maxWidth: 560,
          margin: "0 auto",
          lineHeight: 1.7,
        }}>
          The top players in Algorium, ranked by their duel victories and Codeforces rating.
        </p>
      </div>

      <div className="neu-card" style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ background: "var(--bg-subtle)", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "16px 24px", fontWeight: 700, color: "var(--text-muted)", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Rank</th>
                <th style={{ padding: "16px 24px", fontWeight: 700, color: "var(--text-muted)", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Player</th>
                <th style={{ padding: "16px 24px", fontWeight: 700, color: "var(--text-muted)", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Rating</th>
                <th style={{ padding: "16px 24px", fontWeight: 700, color: "var(--text-muted)", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>W / L / D</th>
                <th style={{ padding: "16px 24px", fontWeight: 700, color: "var(--text-muted)", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id} className="hover-bg-subtle" style={{ borderBottom: "1px solid var(--border)", transition: "background 0.2s" }}>
                  <td style={{ padding: "16px 24px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: "1.1rem", color: i < 3 ? "var(--accent)" : "var(--text-secondary)" }}>
                      {i === 0 && <Medal style={{ color: "gold", width: 20, height: 20 }} />}
                      {i === 1 && <Medal style={{ color: "silver", width: 20, height: 20 }} />}
                      {i === 2 && <Medal style={{ color: "#cd7f32", width: 20, height: 20 }} />}
                      {i > 2 && <span style={{ width: 20, display: "inline-block", textAlign: "center" }}>#{i + 1}</span>}
                    </div>
                  </td>
                  <td style={{ padding: "16px 24px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <img src={u.avatar} alt={u.handle} style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }} />
                      <div>
                        <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "1rem" }}>{u.handle}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{u.rank}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "16px 24px", fontWeight: 800, color: "var(--text-primary)", fontSize: "1.1rem" }}>
                    {u.rating}
                  </td>
                  <td style={{ padding: "16px 24px" }}>
                    <span style={{ color: "var(--success)", fontWeight: 700 }}>{u.wins}</span>
                    <span style={{ color: "var(--text-muted)", margin: "0 4px" }}>/</span>
                    <span style={{ color: "var(--danger)", fontWeight: 700 }}>{u.losses}</span>
                    <span style={{ color: "var(--text-muted)", margin: "0 4px" }}>/</span>
                    <span style={{ color: "var(--text-secondary)", fontWeight: 700 }}>{u.draws}</span>
                  </td>
                  <td style={{ padding: "16px 24px", textAlign: "right" }}>
                    <Link href={`/profile/${encodeURIComponent(u.handle)}`} className="neu-btn" style={{ padding: "8px 16px", fontSize: "0.78rem", display: "inline-flex" }}>
                      <span>Profile</span>
                      <ArrowRight style={{ width: 14, height: 14 }} />
                    </Link>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
