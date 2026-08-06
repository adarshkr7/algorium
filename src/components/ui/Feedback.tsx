"use client";

import React from "react";
import Link from "next/link";
import { AlertTriangle, Info, CheckCircle2, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { buttonStyles } from "./Button";

/* ── Spinner ─────────────────────────────────────────────────────────────── */

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
    />
  );
}

/* ── Skeleton ────────────────────────────────────────────────────────────── */

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-white/6",
        className,
      )}
    />
  );
}

/* ── Full-page loading state ─────────────────────────────────────────────── */

export function LoadingScreen({
  icon,
  message,
}: {
  icon?: React.ReactNode;
  message?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[55dvh] flex-col items-center justify-center gap-4 px-5 text-center">
      {icon && (
        <div className="flex size-16 animate-float items-center justify-center rounded-lg border border-white/10 bg-white/3 text-ink">
          {icon}
        </div>
      )}
      <p className="font-mono text-sm text-ink-faint">{message ?? "Loading…"}</p>
    </div>
  );
}

/* ── Full-page error state ───────────────────────────────────────────────── */

export function ErrorScreen({
  title,
  message,
  actionLabel = "Return home",
  actionHref = "/",
  onAction,
}: {
  title: string;
  message?: React.ReactNode;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[55dvh] max-w-md flex-col items-center justify-center gap-4 px-5 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-danger/10">
        <AlertTriangle className="size-6 text-danger" />
      </span>
      <h2 className="text-xl font-extrabold text-ink">{title}</h2>
      {message && (
        <p className="text-sm leading-relaxed text-ink-dim">{message}</p>
      )}
      {onAction ? (
        <button onClick={onAction} className={buttonStyles({ variant: "secondary" })}>
          {actionLabel}
        </button>
      ) : (
        <Link href={actionHref} className={buttonStyles({ variant: "secondary" })}>
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

/* ── Empty state ─────────────────────────────────────────────────────────── */

export function EmptyState({
  icon,
  title,
  message,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  message?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "panel flex flex-col items-center gap-3 rounded-lg px-6 py-10 text-center",
        className,
      )}
    >
      {icon && (
        <span className="flex size-11 items-center justify-center rounded-full bg-white/5 text-ink-faint">
          {icon}
        </span>
      )}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {message && (
        <p className="max-w-sm text-xs leading-relaxed text-ink-faint">
          {message}
        </p>
      )}
      {action}
    </div>
  );
}

/* ── Inline alert ────────────────────────────────────────────────────────── */

export type AlertTone = "info" | "success" | "warning" | "danger";

const ALERT_STYLES: Record<AlertTone, { wrap: string; icon: React.ReactNode }> = {
  info: {
    wrap: "border-white/10 bg-white/4 text-ink",
    icon: <Info className="size-4 shrink-0 text-info" />,
  },
  success: {
    wrap: "border-success/25 bg-success/8 text-success",
    icon: <CheckCircle2 className="size-4 shrink-0" />,
  },
  warning: {
    wrap: "border-warning/25 bg-warning/8 text-warning",
    icon: <AlertTriangle className="size-4 shrink-0" />,
  },
  danger: {
    wrap: "border-danger/25 bg-danger/8 text-danger",
    icon: <ShieldAlert className="size-4 shrink-0" />,
  },
};

export function Alert({
  tone = "info",
  children,
  className,
  shake,
}: {
  tone?: AlertTone;
  children: React.ReactNode;
  className?: string;
  shake?: boolean;
}) {
  const s = ALERT_STYLES[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-md border px-4 py-3 text-[0.82rem] leading-relaxed font-medium",
        s.wrap,
        shake && "animate-shake",
        className,
      )}
    >
      <span className="mt-0.5">{s.icon}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}
