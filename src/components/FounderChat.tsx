"use client";

import { useEffect, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";

/**
 * Direct line to the founder — help, suggestions, feature requests.
 * Not a sales bot.
 */
export function FounderChat() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState("help");
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "err">(
    "idle"
  );
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (session?.user?.email) setEmail(session.user.email);
    if (session?.user?.name) setName(session.user.name);
  }, [session?.user?.email, session?.user?.name]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErr(null);
    try {
      const r = await fetch("/api/founder-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          topic,
          message,
          company: honeypot,
          pagePath:
            typeof window !== "undefined" ? window.location.pathname : "",
        }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!r.ok) {
        setStatus("err");
        setErr(j.error || "Could not send — try again.");
        return;
      }
      setStatus("ok");
      setMessage("");
    } catch {
      setStatus("err");
      setErr("Network error — try again.");
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-[80] flex flex-col items-end gap-2">
      {open && (
        <div
          className="w-[min(100vw-2rem,22rem)] rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl"
          role="dialog"
          aria-label="Message the founder"
        >
          <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2.5">
            <div>
              <p className="text-[13px] font-semibold text-[var(--text-primary)]">
                Talk to Ron
              </p>
              <p className="text-[10px] text-[var(--text-muted)]">
                Help · suggestions · feature requests
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {status === "ok" ? (
            <div className="space-y-3 px-3 py-4 text-[12px] leading-relaxed text-[var(--text-secondary)]">
              <p className="font-medium text-emerald-300">
                Message received.
              </p>
              <p>
                I read these myself. If you need a reply, I&apos;ll email you
                at the address you left.
              </p>
              <button
                type="button"
                className="text-[11px] font-semibold text-emerald-400 hover:underline"
                onClick={() => setStatus("idle")}
              >
                Send another
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-2.5 px-3 py-3">
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                className="hidden"
                aria-hidden
              />
              <label className="block text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                Topic
                <select
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-[12px] text-[var(--text-primary)]"
                >
                  <option value="help">I need help</option>
                  <option value="suggestion">Suggestion</option>
                  <option value="request">Feature request</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="block text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                Name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-[12px] text-[var(--text-primary)]"
                  placeholder="Optional"
                />
              </label>
              <label className="block text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                Email
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-[12px] text-[var(--text-primary)]"
                  placeholder="you@email.com"
                />
              </label>
              <label className="block text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                Message
                <textarea
                  required
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="mt-1 w-full resize-none rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-[12px] text-[var(--text-primary)]"
                  placeholder="What’s broken, confusing, or missing?"
                />
              </label>
              {err && (
                <p className="text-[11px] text-red-300" role="alert">
                  {err}
                </p>
              )}
              <button
                type="submit"
                disabled={status === "sending"}
                className="w-full rounded bg-emerald-600 py-2 text-[12px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                {status === "sending" ? "Sending…" : "Send to Ron"}
              </button>
            </form>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-600 px-4 py-2.5 text-[12px] font-semibold text-white shadow-lg hover:bg-emerald-500",
          open && "bg-zinc-800 border-zinc-600 hover:bg-zinc-700"
        )}
        aria-expanded={open}
      >
        <MessageCircle className="h-4 w-4" aria-hidden />
        {open ? "Close" : "Talk to founder"}
      </button>
    </div>
  );
}
