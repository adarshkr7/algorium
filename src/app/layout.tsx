import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/app/providers";

export const metadata: Metadata = {
  title: "Algorium - Real-time 1v1 Competitive Programming Platform",
  description:
    "Challenge competitive programmers in real-time 1v1 Blitz and Classic duels powered by the Codeforces API.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        style={{
          backgroundColor: "#000000",
          color: "var(--text-primary)",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div className="bg-ambient-glow" />
        <div className="bg-grid" />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
