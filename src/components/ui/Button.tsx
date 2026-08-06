"use client";

import React from "react";
import {
  buttonStyles,
  type ButtonSize,
  type ButtonVariant,
} from "./button-styles";

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
