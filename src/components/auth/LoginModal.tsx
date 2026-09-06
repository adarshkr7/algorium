"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle,
  ExternalLink,
  RefreshCw,
  Swords,
  Zap,
} from "lucide-react";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { useUser, type UserSession } from "@/context/UserContext";
import {
  Alert,
  Button,
  Field,
  Input,
  Modal,
} from "@/components/ui";

type Step = "handle" | "password" | "verify" | "register";

const STEP_LABELS: Record<Step, string> = {
  handle: "Enter your handle",
  password: "Enter your password",
  verify: "Prove you own the account",
  register: "Set up your account",
};

/**
 * Codeforces sign-in flow.
 *
 * 1. handle → known account? password : ownership proof
 * 2. verify → submit deliberately broken code to an assigned problem
 * 3. register → set email + password, which signs you in
 */
export function LoginModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { setUser } = useUser();
  const router = useRouter();

  const [step, setStep] = useState<Step>("handle");
  const [handleInput, setHandleInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [pendingHandle, setPendingHandle] = useState("");
  const [passwordToken, setPasswordToken] = useState("");
  const [problemToken, setProblemToken] = useState("");
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expiresAtRef = useRef<number | null>(null);

  /**
   * State only — no ref writes, so this is safe to call while rendering.
   * `expiresAtRef` needs no clearing here: the countdown that reads it is
   * gated on `step === "verify"`, and step goes back to "handle" below.
   */
  const reset = () => {
    setStep("handle");
    setHandleInput("");
    setPasswordInput("");
    setEmailInput("");
    setPendingHandle("");
    setPasswordToken("");
    setProblemToken("");
    setSecondsLeft(null);
    setError(null);
    setLoading(false);
  };

  // Clear the form on close, so reopening starts at step one rather than
  // showing the last attempt's handle and error. Adjusted during render for
  // the same reason as the navbar's menus: an effect would do this a paint
  // later, and re-render the whole modal to get there.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) reset();
  }

  // Countdown for the verification window.
  useEffect(() => {
    if (step !== "verify" || !expiresAtRef.current) return;
    const tick = () => {
      const remaining = Math.max(
        0,
        Math.round((expiresAtRef.current! - Date.now()) / 1000),
      );
      setSecondsLeft(remaining);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [step]);

  const close = () => {
    onClose();
  };

  async function submitHandle(e: React.FormEvent, forceVerify = false) {
    e.preventDefault();
    if (!handleInput.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{
        step: "password" | "verify";
        handle: string;
        token?: string;
        expiresAt?: string;
      }>("/api/users/login", {
        method: "POST",
        body: { handle: handleInput.trim(), forceVerify },
      });

      setPendingHandle(data.handle);
      if (data.step === "password") {
        setStep("password");
      } else {
        setProblemToken(data.token ?? "");
        expiresAtRef.current = data.expiresAt
          ? new Date(data.expiresAt).getTime()
          : Date.now() + 5 * 60_000;
        setStep("verify");
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ user: UserSession }>("/api/users/auth", {
        method: "POST",
        body: { handle: pendingHandle, password: passwordInput },
      });
      setUser(data.user);
      close();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function verifyOwnership() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ passwordToken: string }>(
        "/api/users/login/verify",
        { method: "POST", body: { handle: pendingHandle } },
      );
      setPasswordToken(data.passwordToken);
      setPasswordInput("");
      setStep("register");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function submitRegistration(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ user: UserSession }>(
        "/api/users/register",
        {
          method: "POST",
          body: {
            handle: pendingHandle,
            email: emailInput,
            password: passwordInput,
            passwordToken,
          },
        },
      );
      setUser(data.user);
      close();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const problemUrl = (() => {
    const contestId = problemToken.match(/^(\d+)/)?.[1];
    const index = problemToken.match(/([A-Z]+)$/)?.[1];
    return contestId && index
      ? `https://codeforces.com/problemset/problem/${contestId}/${index}`
      : "https://codeforces.com/problemset";
  })();

  return (
    <Modal
      open={open}
      onClose={close}
      size="md"
      icon={<Swords className="size-5" />}
      title="Sign in to Algorium"
      description={STEP_LABELS[step]}
    >
      <div className="flex flex-col gap-5">
        {error && (
          <Alert tone="danger" shake>
            {error}
          </Alert>
        )}

        {/* ── Step 1: handle ─────────────────────────────────────────────── */}
        {step === "handle" && (
          <form onSubmit={submitHandle} className="flex flex-col gap-5">
            <Field
              label="Codeforces handle"
              htmlFor="cf-handle"
              hint="We only use this to read your public submissions."
            >
              <Input
                id="cf-handle"
                autoFocus
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="e.g. tourist"
                value={handleInput}
                onChange={(e) => setHandleInput(e.target.value)}
                required
              />
            </Field>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={loading}
                loadingText="Checking…"
                icon={<Zap className="size-4" />}
              >
                Continue
              </Button>
            </div>
          </form>
        )}

        {/* ── Step 2a: password ──────────────────────────────────────────── */}
        {step === "password" && (
          <form onSubmit={submitPassword} className="flex flex-col gap-5">
            <Field
              label="Password"
              htmlFor="cf-password"
              action={
                <button
                  type="button"
                  onClick={() => {
                    router.push("/change-pass");
                    close();
                  }}
                  className="cursor-pointer border-0 bg-transparent text-xs font-semibold text-ink-dim underline underline-offset-2 hover:text-ink"
                >
                  Forgot password?
                </button>
              }
            >
              <Input
                id="cf-password"
                type="password"
                autoFocus
                autoComplete="current-password"
                placeholder="Your password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                required
              />
            </Field>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStep("handle");
                  setError(null);
                  setPasswordInput("");
                }}
              >
                Use a different handle
              </Button>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button type="button" variant="ghost" onClick={close}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={loading}
                  loadingText="Signing in…"
                >
                  Sign in
                </Button>
              </div>
            </div>
          </form>
        )}

        {/* ── Step 2b: ownership proof ───────────────────────────────────── */}
        {step === "verify" && (
          <div className="flex flex-col gap-5">
            <div className="panel flex flex-col gap-4 rounded-md p-4 sm:p-5">
              <p className="text-[0.82rem] leading-relaxed text-ink-dim">
                To prove you own{" "}
                <strong className="text-ink">{pendingHandle}</strong>, submit any
                code that fails to compile on this problem:
              </p>

              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-md border border-line bg-elevated px-4 py-3 text-center font-mono text-xl font-bold tracking-[0.18em] text-ink">
                  {problemToken}
                </div>
                <a
                  href={problemUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open the problem on Codeforces"
                  className="flex size-12 shrink-0 items-center justify-center rounded-full border border-line-strong text-ink transition-colors hover:bg-elevated"
                >
                  <ExternalLink className="size-4" />
                </a>
              </div>

              <ol className="m-0 flex list-decimal flex-col gap-1.5 pl-5 text-[0.78rem] leading-relaxed text-ink-dim">
                <li>Open problem {problemToken} using the button above</li>
                <li>
                  Submit nonsense, e.g.{" "}
                  <code className="rounded bg-white/8 px-1.5 py-0.5 font-mono text-ink">
                    not code
                  </code>
                </li>
                <li>
                  Wait for the{" "}
                  <strong className="text-ink">COMPILATION ERROR</strong>{" "}
                  verdict
                </li>
                <li>Come back and press Verify</li>
              </ol>

              <p className="m-0 font-mono text-[0.7rem] text-ink-faint">
                {secondsLeft !== null && secondsLeft > 0
                  ? `Expires in ${Math.floor(secondsLeft / 60)}:${String(
                      secondsLeft % 60,
                    ).padStart(2, "0")}`
                  : "This code has expired — start over."}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                variant="ghost"
                size="sm"
                icon={<RefreshCw className="size-3.5" />}
                onClick={(e) => submitHandle(e, true)}
              >
                Start over
              </Button>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button variant="ghost" onClick={close}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  loading={loading}
                  loadingText="Verifying…"
                  onClick={verifyOwnership}
                  icon={<CheckCircle className="size-4" />}
                >
                  Verify
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 3: account setup ──────────────────────────────────────── */}
        {step === "register" && (
          <form onSubmit={submitRegistration} className="flex flex-col gap-5">
            <Alert tone="success">
              Ownership of {pendingHandle} confirmed. Set a password so you can
              sign in instantly next time.
            </Alert>

            <Field label="Email" htmlFor="cf-email" hint="Used only for password resets.">
              <Input
                id="cf-email"
                type="email"
                autoFocus
                autoComplete="email"
                placeholder="you@example.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                required
              />
            </Field>

            <Field
              label="Password"
              htmlFor="cf-new-password"
              hint="At least 8 characters, including a number."
            >
              <Input
                id="cf-new-password"
                type="password"
                autoComplete="new-password"
                placeholder="Choose a password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                required
                minLength={8}
              />
            </Field>

            <Button
              type="submit"
              variant="primary"
              fullWidth
              loading={loading}
              loadingText="Creating account…"
            >
              Create account
            </Button>
          </form>
        )}
      </div>
    </Modal>
  );
}
