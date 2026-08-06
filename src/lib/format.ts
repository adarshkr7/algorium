/** Shared formatting helpers. Safe to import from client components. */

/** 754 -> "12:34". Hours are included only when needed. */
export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");

  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

/** Seconds from contest start -> "+12m04s". */
export function formatSolveTime(seconds?: number | null): string {
  if (seconds === null || seconds === undefined) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `+${m}m${s.toString().padStart(2, "0")}s` : `+${m}m`;
}

/** ISO timestamp -> local wall-clock time. */
export function formatClockTime(value?: string | Date | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatDate(value?: string | Date | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "3 minutes ago" style, coarse. */
export function formatRelative(value?: string | Date | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";

  const diffSeconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSeconds < 60) return "just now";
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
  if (diffSeconds < 86_400) return `${Math.floor(diffSeconds / 3600)}h ago`;
  if (diffSeconds < 604_800) return `${Math.floor(diffSeconds / 86_400)}d ago`;
  return formatDate(d);
}

/** Duration in seconds -> "42m" / "1h 12m". */
export function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** 0 -> "A", 1 -> "B", … */
export function problemLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

/** "1800-A" -> Codeforces problem URL. */
export function codeforcesProblemUrl(problemKey?: string | null): string {
  if (!problemKey) return "https://codeforces.com/problemset";
  return `https://codeforces.com/problemset/problem/${problemKey.replace("-", "/")}`;
}

/** Signed Elo delta, e.g. "+18" / "−12". */
export function formatEloDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `−${Math.abs(delta)}`;
  return "±0";
}
