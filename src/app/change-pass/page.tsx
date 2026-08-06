"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, KeyRound, Mail } from "lucide-react";
import { apiFetch, errorMessage } from "@/lib/api-client";
import {
  Alert,
  Button,
  buttonStyles,
  Card,
  Field,
  Input,
} from "@/components/ui";

type Step = "request" | "reset" | "done";

export default function ChangePasswordPage() {
  const [step, setStep] = useState<Step>("request");
  const [handleOrEmail, setHandleOrEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ sentTo: string | null }>(
        "/api/users/forgot-password/send-otp",
        { method: "POST", body: { handleOrEmail } },
      );
      setSentTo(data.sentTo);
      setStep("reset");
    } catch (err) {
      setError(errorMessage(err, "Couldn't send the code."));
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // Note: this posts `handleOrEmail`, which the API now reads. It used to
      // expect `handle`, so resets silently failed for everyone.
      await apiFetch("/api/users/forgot-password/reset", {
        method: "POST",
        body: { handleOrEmail, otp, newPassword },
      });
      setStep("done");
    } catch (err) {
      setError(errorMessage(err, "Couldn't reset your password."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 py-6 sm:py-12">
      <Card padding="lg" className="animate-fade-up">
        <div className="mb-7 flex flex-col items-center text-center">
          <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-white/5">
            <KeyRound className="size-6 text-ink" />
          </span>
          <h1 className="text-xl font-extrabold text-ink">
            {step === "done" ? "Password updated" : "Reset your password"}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-dim">
            {step === "request" &&
              "Enter your handle or email and we'll send a one-time code."}
            {step === "reset" &&
              (sentTo
                ? `Enter the 6-digit code we sent to ${sentTo}.`
                : "Enter the 6-digit code we sent to your email.")}
            {step === "done" && "You can sign in with your new password now."}
          </p>
        </div>

        {error && (
          <Alert tone="danger" shake className="mb-5">
            {error}
          </Alert>
        )}

        {step === "request" && (
          <form onSubmit={requestCode} className="flex flex-col gap-5">
            <Field label="Handle or email" htmlFor="identifier">
              <Input
                id="identifier"
                autoFocus
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="tourist or you@example.com"
                value={handleOrEmail}
                onChange={(e) => setHandleOrEmail(e.target.value)}
                required
              />
            </Field>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              loading={loading}
              loadingText="Sending…"
              icon={<Mail className="size-4" />}
            >
              Send code
            </Button>
          </form>
        )}

        {step === "reset" && (
          <form onSubmit={resetPassword} className="flex flex-col gap-5">
            <Field label="6-digit code" htmlFor="otp">
              <Input
                id="otp"
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                className="text-center font-mono text-lg tracking-[0.4em]"
                required
              />
            </Field>

            <Field
              label="New password"
              htmlFor="new-password"
              hint="At least 8 characters, including a number."
            >
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                placeholder="Choose a new password"
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </Field>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              loading={loading}
              loadingText="Updating…"
              icon={<CheckCircle2 className="size-4" />}
            >
              Reset password
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              fullWidth
              onClick={() => {
                setStep("request");
                setError(null);
              }}
            >
              Use a different account
            </Button>
          </form>
        )}

        {step === "done" && (
          <Link
            href="/"
            className={buttonStyles({
              variant: "primary",
              size: "lg",
              fullWidth: true,
            })}
          >
            Back to home
            <ArrowRight className="size-4" />
          </Link>
        )}
      </Card>
    </div>
  );
}
