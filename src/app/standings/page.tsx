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

      <div style={{ display: "flex", flexDirection: "column" }}>
        {users.map((u, i) => (
          <Link href={`/profile/${encodeURIComponent(u.handle)}`} key={u.id} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
            padding: "24px 20px",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
            textDecoration: "none",
            transition: "background 0.2s",
            borderRadius: "16px",
          }}
          className="hover-bg-subtle">
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <div style={{ width: 40, textAlign: "center", fontWeight: 800, fontSize: "1.2rem", color: i < 3 ? "var(--accent)" : "var(--text-muted)" }}>
                {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
              </div>
              <img src={u.avatar} alt={u.handle} style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover" }} />
              <div>
                <div style={{ fontWeight: 800, color: "#FFFFFF", fontSize: "1.2rem", letterSpacing: "-0.02em" }}>{u.handle}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 4 }}>{u.rank}</div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 32, textAlign: "right" }}>
              <div className="font-mono">
                <div style={{ fontWeight: 800, color: "var(--success)", fontSize: "1.2rem" }}>
                  {u.rating}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4 }}>
                  <span style={{ color: "var(--success)" }}>{u.wins}</span> / <span style={{ color: "var(--danger)" }}>{u.losses}</span> / {u.draws}
                </div>
              </div>
              <ArrowRight style={{ width: 20, height: 20, color: "var(--text-muted)" }} />
            </div>
          </Link>
        ))}
        {users.length === 0 && (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
            No users found.
          </div>
        )}
      </div>
    </div>
  );
}
