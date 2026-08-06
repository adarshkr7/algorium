"use client";

import React from "react";
import { cn } from "@/lib/cn";

export interface SegmentOption<T extends string> {
  value: T;
  label: React.ReactNode;
  /** Shown under the control when this option is active. */
  hint?: string;
  disabled?: boolean;
}

/**
 * Sliding pill selector. The indicator is positioned with a percentage
 * transform so it works for any number of options and any container width.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  className,
  ariaLabel,
}: {
  value: T;
  onChange: (next: T) => void;
  options: SegmentOption<T>[];
  size?: "sm" | "md";
  className?: string;
  ariaLabel?: string;
}) {
  const activeIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const count = options.length || 1;
  const activeHint = options[activeIndex]?.hint;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="relative flex rounded-full border border-line bg-surface p-1.5"
      >
        <span
          aria-hidden
          className="absolute top-1.5 bottom-1.5 left-1.5 rounded-full bg-ink transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{
            width: `calc((100% - 0.75rem) / ${count})`,
            transform: `translateX(${activeIndex * 100}%)`,
          }}
        />
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={opt.disabled}
              onClick={() => onChange(opt.value)}
              className={cn(
                "relative z-10 flex-1 cursor-pointer rounded-full border-0 bg-transparent font-bold whitespace-nowrap",
                "transition-colors duration-300 disabled:cursor-not-allowed disabled:opacity-40",
                size === "sm" ? "py-2 text-xs" : "py-2.5 text-sm sm:text-[0.95rem]",
                active ? "text-ink-invert" : "text-ink-dim hover:text-ink",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {activeHint && (
        <p className="min-h-4 text-xs leading-relaxed text-ink-faint">
          {activeHint}
        </p>
      )}
    </div>
  );
}
