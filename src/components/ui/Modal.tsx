"use client";

import React, { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useMounted } from "@/lib/use-mounted";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./Button";

export interface ModalProps {
  open: boolean;
  onClose?: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  /** Hides the close button and ignores backdrop clicks / Escape. */
  dismissible?: boolean;
  className?: string;
}

const SIZES = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-xl",
} as const;

/**
 * Centred dialog on desktop, bottom sheet on mobile.
 * Locks body scroll and traps Escape while open.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  icon,
  footer,
  children,
  size = "md",
  dismissible = true,
  className,
}: ModalProps) {
  const mounted = useMounted();

  const handleClose = useCallback(() => {
    if (dismissible) onClose?.();
  }, [dismissible, onClose]);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, handleClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      className={cn(
        "fixed inset-0 z-[200] flex animate-fade-in bg-black/80 backdrop-blur-sm",
        // Bottom sheet on phones, centred dialog from `sm` up.
        "items-end justify-center p-0 sm:items-center sm:p-5",
      )}
    >
      <div
        className={cn(
          "flex max-h-[92dvh] w-full flex-col overflow-hidden border border-white/10 bg-surface shadow-pop",
          "animate-sheet-up rounded-t-2xl sm:animate-scale-in sm:rounded-2xl",
          "pb-safe",
          SIZES[size],
          className,
        )}
      >
        {/* Drag affordance — mobile only */}
        <div className="flex justify-center pt-3 sm:hidden">
          <span className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        {(title || dismissible) && (
          <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4 sm:px-7 sm:pt-7">
            <div className="flex min-w-0 items-center gap-3.5">
              {icon && (
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/5 text-ink">
                  {icon}
                </span>
              )}
              <div className="min-w-0">
                {title && (
                  <h2 className="truncate text-lg font-extrabold text-ink">
                    {title}
                  </h2>
                )}
                {description && (
                  <p className="mt-0.5 text-[0.8rem] leading-relaxed text-ink-dim">
                    {description}
                  </p>
                )}
              </div>
            </div>
            {dismissible && (
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close dialog"
                className="-mr-1 shrink-0 cursor-pointer rounded-full p-2 text-ink-faint transition-colors hover:bg-white/5 hover:text-ink"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-7 sm:pb-7">
          {children}
        </div>

        {footer && (
          <div className="border-t border-white/6 px-5 py-4 sm:px-7">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Replacement for window.confirm — themed, keyboard accessible, mobile-friendly. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  loading,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-ink-dim">{message}</p>
    </Modal>
  );
}
