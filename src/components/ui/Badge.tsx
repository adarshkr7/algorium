import React from "react";
import { cn } from "@/lib/cn";

export type BadgeTone =
  | "neutral"
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "solid";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-white/5 text-ink-dim border-white/10",
  brand: "bg-brand/10 text-brand-bright border-brand/25",
  success: "bg-success/10 text-success border-success/25",
  warning: "bg-warning/10 text-warning border-warning/25",
  danger: "bg-danger/10 text-danger border-danger/25",
  info: "bg-info/10 text-info border-info/25",
  solid: "bg-ink text-ink-invert border-transparent",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  icon?: React.ReactNode;
  size?: "sm" | "md";
}

export function Badge({
  tone = "neutral",
  icon,
  size = "sm",
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold whitespace-nowrap",
        size === "sm" ? "px-2.5 py-1 text-[0.68rem]" : "px-3 py-1.5 text-xs",
        TONES[tone],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </span>
  );
}

const VERDICT_TONE: Record<string, BadgeTone> = {
  OK: "success",
  TESTING: "warning",
  PENDING: "warning",
};

/** Renders a Codeforces verdict with the right colour and a short label. */
export function VerdictBadge({
  verdict,
  className,
}: {
  verdict?: string | null;
  className?: string;
}) {
  const v = verdict ?? "UNKNOWN";
  const tone = VERDICT_TONE[v] ?? "danger";
  const label =
    v === "OK" ? "AC" : v === "TESTING" ? "TESTING…" : v.replace(/_/g, " ");

  return (
    <Badge tone={tone} className={cn("font-mono tracking-tight", className)}>
      {label}
    </Badge>
  );
}

/**
 * Codeforces difficulty pill. The palette is monochrome, so the rating band is
 * expressed as contrast: the harder the problem, the louder the pill reads.
 */
export function RatingBadge({
  rating,
  className,
}: {
  rating: number;
  className?: string;
}) {
  const tone: BadgeTone =
    rating >= 2100 ? "solid" : rating >= 1600 ? "brand" : "neutral";
  return (
    <Badge tone={tone} className={cn("font-mono", className)}>
      {rating}
    </Badge>
  );
}
