import { cn } from "@/lib/cn";

/**
 * Button class composition.
 *
 * Deliberately kept OUT of Button.tsx, which is a `"use client"` module.
 * Server components (the standings page renders `<Link className={...}>`)
 * need to *call* this function during SSR, and a plain function exported from
 * a client module can only be rendered or passed as a prop — calling it throws
 * "Attempted to call buttonStyles() from the server".
 *
 * This file has no client directive, so both sides can import it.
 */

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "success"
  | "outline";

export type ButtonSize = "xs" | "sm" | "md" | "lg";

export const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-ink text-ink-invert border-transparent hover:bg-ink-dim active:scale-[0.98] shadow-glow",
  secondary:
    "bg-elevated text-ink border-line-strong hover:bg-line-strong hover:border-ink-faint",
  ghost:
    "bg-transparent text-ink-dim border-transparent hover:bg-white/5 hover:text-ink",
  danger:
    "bg-transparent text-danger border-danger/35 hover:bg-danger hover:text-white hover:border-danger",
  success: "bg-brand text-white border-transparent hover:bg-brand-bright",
  outline:
    "bg-transparent text-ink border-white/15 hover:border-white/35 hover:bg-white/5",
};

export const BUTTON_SIZES: Record<ButtonSize, string> = {
  xs: "h-8 px-3 text-xs gap-1.5",
  sm: "h-9 px-4 text-[0.8rem] gap-2",
  md: "h-11 px-5 text-sm gap-2",
  lg: "h-13 px-7 text-base gap-2.5",
};

export function buttonStyles({
  variant = "secondary",
  size = "md",
  fullWidth = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
} = {}) {
  return cn(
    "inline-flex items-center justify-center rounded-full border font-semibold",
    "cursor-pointer select-none whitespace-nowrap no-underline",
    "transition-[background-color,border-color,color,transform,opacity] duration-150",
    "disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-inherit disabled:active:scale-100",
    BUTTON_VARIANTS[variant],
    BUTTON_SIZES[size],
    fullWidth && "w-full",
    className,
  );
}
