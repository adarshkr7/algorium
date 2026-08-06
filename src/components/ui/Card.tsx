import React from "react";
import { cn } from "@/lib/cn";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Adds a hover lift. Use for cards that are links or buttons. */
  interactive?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
}

const PADDING = {
  none: "",
  sm: "p-4",
  md: "p-5 sm:p-6",
  lg: "p-6 sm:p-8",
} as const;

export function Card({
  interactive,
  padding = "md",
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={cn(
        "panel rounded-lg",
        PADDING[padding],
        interactive && "panel-hover cursor-pointer",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Uppercase micro-heading used above every panel in the app. */
export function SectionTitle({
  icon,
  children,
  action,
  className,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <h2 className="text-eyebrow flex items-center gap-2 text-ink-faint">
        {icon}
        {children}
      </h2>
      {action}
    </div>
  );
}

/** A labelled key/value row — used in config bars and summaries. */
export function DataPoint({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-ink-faint">
        {label}
      </span>
      <span className="text-base font-bold text-ink sm:text-lg">{value}</span>
    </div>
  );
}
