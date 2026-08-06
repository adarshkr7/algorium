import React from "react";
import { cn } from "@/lib/cn";

/** Standard page shell: max width, responsive gutters, vertical rhythm. */
export function PageShell({
  children,
  className,
  width = "default",
}: {
  children: React.ReactNode;
  className?: string;
  width?: "narrow" | "default" | "wide";
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full",
        width === "narrow" && "max-w-2xl",
        width === "default" && "max-w-4xl",
        width === "wide" && "max-w-6xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Page title block with optional eyebrow, description and trailing actions. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  icon,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-5 border-b border-white/6 pb-6",
        "sm:flex-row sm:items-end sm:justify-between sm:gap-8",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-4">
        {icon && (
          <span className="mt-1 flex size-11 shrink-0 items-center justify-center rounded-full bg-white/5 sm:size-12">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-eyebrow mb-2 text-ink-faint">{eyebrow}</p>
          )}
          <h1 className="text-display-sm text-ink">{title}</h1>
          {description && (
            <div className="mt-2 text-sm leading-relaxed text-ink-dim">
              {description}
            </div>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          {actions}
        </div>
      )}
    </header>
  );
}

/** Horizontal divider with optional centred label. */
export function Divider({
  label,
  className,
}: {
  label?: string;
  className?: string;
}) {
  if (!label) {
    return <hr className={cn("h-px border-0 bg-white/8", className)} />;
  }
  return (
    <div className={cn("flex items-center gap-4", className)}>
      <span className="h-px flex-1 bg-white/8" />
      <span className="text-eyebrow text-ink-faint">{label}</span>
      <span className="h-px flex-1 bg-white/8" />
    </div>
  );
}

/** Big numeric stat tile. */
export function Stat({
  label,
  value,
  tone = "default",
  sub,
  className,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "success" | "danger" | "warning" | "brand";
  sub?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "panel flex flex-col items-center gap-2 rounded-lg px-3 py-5 text-center sm:px-5 sm:py-7",
        className,
      )}
    >
      <span className="text-[0.62rem] font-bold tracking-[0.12em] text-ink-faint uppercase sm:text-[0.7rem]">
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-2xl font-extrabold sm:text-3xl",
          tone === "default" && "text-ink",
          tone === "success" && "text-success",
          tone === "danger" && "text-danger",
          tone === "warning" && "text-warning",
          tone === "brand" && "text-brand-bright",
        )}
      >
        {value}
      </span>
      {sub && <span className="text-[0.68rem] text-ink-faint">{sub}</span>}
    </div>
  );
}
