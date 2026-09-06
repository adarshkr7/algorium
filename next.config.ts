import type { NextConfig } from "next";

/**
 * Origins the browser genuinely talks to, derived from the same env the client
 * is configured with so a self-hosted Supabase or LiveKit does not need this
 * file edited. The wildcards cover the managed clouds, whose media servers sit
 * on per-region subdomains that are not known ahead of time.
 *
 * Note that `headers()` is evaluated during `next build` and baked into the
 * routes manifest, so these read the *build-time* environment. That is the
 * same constraint `NEXT_PUBLIC_*` already lives under — those values are
 * inlined into the client bundle — so a build that has the right Supabase URL
 * for the browser automatically has the right one here. A build without them
 * still works against the managed clouds through the wildcards.
 */
function externalOrigins(): { http: string[]; ws: string[] } {
  const http: string[] = [];
  const ws: string[] = [];

  const add = (raw: string | undefined) => {
    if (!raw) return;
    try {
      const { origin, protocol, host } = new URL(raw);
      if (protocol === "ws:" || protocol === "wss:") {
        ws.push(origin);
        http.push(`https://${host}`);
      } else {
        http.push(origin);
        ws.push(`wss://${host}`);
      }
    } catch {
      /* unset or malformed — the wildcards below still cover the clouds */
    }
  };

  add(process.env.NEXT_PUBLIC_SUPABASE_URL);
  add(process.env.NEXT_PUBLIC_LIVEKIT_URL ?? process.env.LIVEKIT_URL);

  http.push("https://*.supabase.co", "https://*.livekit.cloud");
  ws.push("wss://*.supabase.co", "wss://*.livekit.cloud");

  return {
    http: [...new Set(http)],
    ws: [...new Set(ws)],
  };
}

function contentSecurityPolicy(): string {
  const isDev = process.env.NODE_ENV !== "production";
  const { http, ws } = externalOrigins();

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],

    // Next inlines the hydration and RSC payload as <script> tags without a
    // nonce, so 'unsafe-inline' is required unless this app grows nonce
    // middleware. 'unsafe-eval' is a dev-only cost of React Fast Refresh.
    "script-src": ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])],

    // Tailwind v4 and Next both emit inline <style>; the font CSS is remote.
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],

    // Codeforces serves profile pictures from userpic.codeforces.org, with the
    // generic fallback on codeforces.org.
    "img-src": [
      "'self'",
      "data:",
      "blob:",
      "https://*.codeforces.org",
      "https://*.codeforces.com",
      "https://codeforces.org",
      "https://codeforces.com",
    ],

    // Supabase Realtime and the LiveKit signalling socket.
    "connect-src": ["'self'", ...http, ...ws],

    // Camera and microphone tracks arrive as blob-backed MediaStreams, and
    // LiveKit runs parts of its pipeline in a worker.
    "media-src": ["'self'", "blob:"],
    "worker-src": ["'self'", "blob:"],

    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "object-src": ["'none'"],
  };

  if (!isDev) directives["upgrade-insecure-requests"] = [];

  return Object.entries(directives)
    .map(([key, values]) => (values.length ? `${key} ${values.join(" ")}` : key))
    .join("; ");
}

const nextConfig: NextConfig = {
  // Nothing gains from advertising the framework and version.
  poweredByHeader: false,

  // Produces .next/standalone, which is what the Dockerfile copies. Harmless
  // for a platform deploy that ignores it.
  output: "standalone",

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy() },
          {
            // Two years, which is the floor for preload eligibility. Only ever
            // sent over HTTPS, so it is inert in local development.
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Belt and braces alongside frame-ancestors, for older browsers.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            // This app genuinely needs the camera and microphone — proctored
            // rooms are the point — so those stay open to same-origin code
            // while everything else is switched off.
            key: "Permissions-Policy",
            value: [
              "camera=(self)",
              "microphone=(self)",
              "display-capture=(self)",
              "geolocation=()",
              "payment=()",
              "usb=()",
              "interest-cohort=()",
            ].join(", "),
          },
        ],
      },
      {
        // Nothing under /api is cacheable, and several routes return another
        // player's live state.
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
        ],
      },
    ];
  },
};

export default nextConfig;
