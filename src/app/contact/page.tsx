"use client";

import React, { useState } from "react";
import { Mail, MessageSquare, Send } from "lucide-react";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { useUser } from "@/context/UserContext";
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Textarea,
} from "@/components/ui";

const SUPPORT_EMAIL = "support.algorium@gmail.com";

export default function ContactPage() {
  const { user } = useUser();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);

    try {
      await apiFetch("/api/contact", {
        method: "POST",
        body: { name, email, subject, message },
      });
      setSent(true);
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
    } catch (err) {
      setError(errorMessage(err, "Couldn't send your message."));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-7">
      <PageHeader
        icon={<MessageSquare className="size-5" />}
        title="Get in touch"
        description="Found a bug, hit an edge case, or have an idea for a mode? Tell us."
      />

      <Card padding="lg">
        {sent && (
          <Alert tone="success" className="mb-6">
            Message sent. We&apos;ll reply to the address you gave us.
          </Alert>
        )}
        {error && (
          <Alert tone="danger" shake className="mb-6">
            {error}
          </Alert>
        )}

        <form onSubmit={submit} className="flex flex-col gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Name" htmlFor="contact-name">
              <Input
                id="contact-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={user?.handle ?? "Your name"}
                maxLength={80}
                required
              />
            </Field>
            <Field label="Email" htmlFor="contact-email">
              <Input
                id="contact-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </Field>
          </div>

          <Field label="Subject" htmlFor="contact-subject">
            <Input
              id="contact-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="What's this about?"
              maxLength={120}
              required
            />
          </Field>

          <Field
            label="Message"
            htmlFor="contact-message"
            hint={`${message.length}/4000 characters`}
          >
            <Textarea
              id="contact-message"
              rows={7}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Include the room code if it's about a specific duel — it makes bugs much easier to trace."
              minLength={10}
              maxLength={4000}
              required
            />
          </Field>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={sending}
            loadingText="Sending…"
            icon={<Send className="size-4" />}
            className="self-stretch sm:self-start"
          >
            Send message
          </Button>
        </form>
      </Card>

      <div className="flex items-center justify-center gap-3 text-sm text-ink-dim">
        <span className="flex size-9 items-center justify-center rounded-full bg-white/5">
          <Mail className="size-4" />
        </span>
        <span>
          Or email{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-semibold text-ink no-underline hover:underline"
          >
            {SUPPORT_EMAIL}
          </a>
        </span>
      </div>
    </div>
  );
}
