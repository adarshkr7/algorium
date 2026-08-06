import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/app/providers";

export const metadata: Metadata = {
  title: {
    default: "Algorium — Real-time 1v1 competitive programming duels",
    template: "%s · Algorium",
  },
  description:
    "Challenge competitive programmers to real-time 1v1 Blitz, Lockout and Classic duels built on official Codeforces problems.",
  applicationName: "Algorium",
  openGraph: {
    title: "Algorium — Real-time 1v1 competitive programming duels",
    description:
      "Blitz, Lockout and Classic duels on official Codeforces problems, with live standings and an Elo ladder.",
    type: "website",
  },
};

/**
 * `viewport-fit=cover` plus the `pb-safe` utility keeps content clear of the
 * iOS home indicator; `themeColor` blends the browser chrome into the app.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body className="flex min-h-dvh flex-col bg-canvas text-ink antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
