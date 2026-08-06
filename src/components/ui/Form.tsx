"use client";

import React from "react";
import { cn } from "@/lib/cn";

const CONTROL_BASE =
  "w-full rounded-md border border-line bg-elevated px-4 text-ink placeholder:text-ink-faint " +
  "outline-none transition-colors duration-200 " +
  "focus:border-ink-dim focus:bg-surface " +
  "disabled:cursor-not-allowed disabled:opacity-50";

/** Label + optional hint + inline error, wrapping any control. */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  action,
  children,
  className,
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  htmlFor?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {(label || action) && (
        <div className="flex items-baseline justify-between gap-3">
          {label && (
            <label
              htmlFor={htmlFor}
              className="text-eyebrow text-ink-faint"
            >
              {label}
            </label>
          )}
          {action}
        </div>
      )}
      {children}
      {error ? (
        <p className="animate-shake text-xs font-semibold text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs leading-relaxed text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(function Input({ className, invalid, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        CONTROL_BASE,
        "h-11",
        invalid && "border-danger/60 focus:border-danger",
        className,
      )}
      {...rest}
    />
  );
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(CONTROL_BASE, "resize-y py-3 leading-relaxed", className)}
      {...rest}
    />
  );
});

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...rest }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          CONTROL_BASE,
          "h-11 cursor-pointer appearance-none pr-10",
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-ink-faint"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </div>
  );
});

/** Oversized borderless input used on the create-duel screen. */
export const DisplayInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function DisplayInput({ className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "w-full border-0 border-b-2 border-line bg-transparent pb-1.5",
        "text-2xl font-bold tracking-tight text-ink outline-none sm:text-3xl",
        "transition-colors duration-200 focus:border-ink",
        "placeholder:text-ink-faint",
        className,
      )}
      {...rest}
    />
  );
});

/** Toggle chip — used for the tag picker. */
export function Chip({
  state = "off",
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  state?: "off" | "include" | "exclude";
}) {
  return (
    <button
      type="button"
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-150 cursor-pointer",
        state === "include" && "border-ink bg-ink text-ink-invert",
        state === "exclude" && "border-danger bg-danger text-white",
        state === "off" &&
          "border-white/15 bg-transparent text-ink-dim hover:border-white/35 hover:text-ink",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** iOS-style switch. */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex items-start justify-between gap-4",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{label}</span>
        {description && (
          <span className="mt-1 block text-xs leading-relaxed text-ink-faint">
            {description}
          </span>
        )}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors duration-200 cursor-pointer",
          checked ? "bg-brand" : "bg-line-strong",
          disabled && "cursor-not-allowed",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white transition-[left] duration-200",
            checked ? "left-[22px]" : "left-0.5",
          )}
        />
      </button>
    </label>
  );
}
