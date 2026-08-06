"use client";

import React from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "success"
  | "outline";

export type ButtonSize = "xs" | "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-ink text-ink-invert border-transparent hover:bg-ink-dim active:scale-[0.98] shadow-glow",
  secondary:
    "bg-elevated text-ink border-line-strong hover:bg-line-strong hover:border-ink-faint",
  ghost:
    "bg-transparent text-ink-dim border-transparent hover:bg-white/5 hover:text-ink",
  danger:
    "bg-transparent text-danger border-danger/35 hover:bg-danger hover:text-white hover:border-danger",
  success:
    "bg-brand text-white border-transparent hover:bg-brand-bright",
  outline:
    "bg-transparent text-ink border-white/15 hover:border-white/35 hover:bg-white/5",
};

const SIZES: Record<ButtonSize, string> = {
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
    VARIANTS[variant],
    SIZES[size],
    fullWidth && "w-full",
    className,
  );
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  /** Text shown while `loading` is true. Falls back to the normal children. */
  loadingText?: string;
  icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "secondary",
      size = "md",
      fullWidth,
      loading,
      loadingText,
      icon,
      className,
      children,
      disabled,
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={buttonStyles({ variant, size, fullWidth, className })}
        {...rest}
      >
        {loading ? (
          <>
            <span
              aria-hidden
              className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
            />
            <span>{loadingText ?? children}</span>
          </>
        ) : (
          <>
            {icon}
            {children}
          </>
        )}
      </button>
    );
  },
);
