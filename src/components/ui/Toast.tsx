"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";

export type ToastTone = "info" | "success" | "warning" | "danger";

interface Toast {
  id: number;
  tone: ToastTone;
  message: React.ReactNode;
}

interface ToastApi {
  push: (message: React.ReactNode, tone?: ToastTone, ttlMs?: number) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Same monochrome rule as Alert: full-ink text, severity in the border. */
const TONE_STYLES: Record<ToastTone, { wrap: string; icon: React.ReactNode }> = {
  info: {
    wrap: "border-white/12 bg-elevated text-ink",
    icon: <Activity className="size-4 shrink-0 text-ink-dim" />,
  },
  success: {
    wrap: "border-white/25 bg-elevated text-ink",
    icon: <CheckCircle2 className="size-4 shrink-0 text-success" />,
  },
  warning: {
    wrap: "border-white/30 bg-elevated text-ink",
    icon: <AlertTriangle className="size-4 shrink-0 text-warning" />,
  },
  danger: {
    wrap: "border-white/45 bg-elevated text-ink",
    icon: <XCircle className="size-4 shrink-0 text-ink" />,
  },
};

/**
 * Stacked, auto-dismissing notifications. Renders bottom-centre on mobile
 * (thumb reach, clear of the nav) and top-right on desktop.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);
  const nextId = useRef(1);

  React.useEffect(() => setMounted(true), []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: React.ReactNode, tone: ToastTone = "info", ttlMs = 4500) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev.slice(-3), { id, tone, message }]);
      window.setTimeout(() => dismiss(id), ttlMs);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {mounted &&
        createPortal(
          <div
            className={cn(
              "pointer-events-none fixed z-[300] flex flex-col gap-2",
              "inset-x-3 bottom-4 items-stretch",
              "sm:inset-x-auto sm:top-20 sm:right-5 sm:bottom-auto sm:w-[22rem] sm:items-end",
            )}
          >
            {toasts.map((t) => {
              const s = TONE_STYLES[t.tone];
              return (
                <div
                  key={t.id}
                  role="status"
                  className={cn(
                    "pointer-events-auto flex w-full animate-sheet-up items-start gap-2.5 rounded-md border px-4 py-3",
                    "text-[0.82rem] leading-snug font-semibold shadow-pop backdrop-blur-md",
                    s.wrap,
                  )}
                >
                  <span className="mt-0.5">{s.icon}</span>
                  <span className="min-w-0 flex-1">{t.message}</span>
                  <button
                    type="button"
                    onClick={() => dismiss(t.id)}
                    aria-label="Dismiss"
                    className="-mr-1 shrink-0 cursor-pointer rounded p-0.5 opacity-50 transition-opacity hover:opacity-100"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
