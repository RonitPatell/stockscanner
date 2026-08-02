"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type RolloutState = {
  enabled: boolean;
  optedOut: boolean;
  stage: string | null;
  reason: string;
  fallback: { feedHref: string; legacyHref: string };
  diagnostics: { buildId: string };
  flags: Record<string, boolean>;
};

/**
 * Beta chrome: opt-out, Feed/legacy fallback, feedback, technical error capture.
 * Does not claim beta metrics as SLAs.
 */
export function MonitorBetaChrome({
  onAccessChange,
}: {
  onAccessChange?: (enabled: boolean) => void;
}) {
  const [state, setState] = useState<RolloutState | null>(null);
  const [feedback, setFeedback] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    void fetch("/api/monitor/rollout")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setState(d);
        onAccessChange?.(d.enabled === true);
      })
      .catch(() => undefined);
  }, [onAccessChange]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onError = (event: ErrorEvent) => {
      void fetch("/api/monitor/rollout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "error_session",
          message: event.message,
          name: event.error?.name ?? "Error",
          stack: event.error?.stack ?? null,
          path: window.location.pathname + window.location.search,
          buildId: state?.diagnostics.buildId ?? null,
          breadcrumbs: ["window.onerror"],
        }),
      }).catch(() => undefined);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      void fetch("/api/monitor/rollout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "error_session",
          message: reason?.message ?? String(reason),
          name: reason?.name ?? "UnhandledRejection",
          stack: reason?.stack ?? null,
          path: window.location.pathname + window.location.search,
          buildId: state?.diagnostics.buildId ?? null,
          breadcrumbs: ["unhandledrejection"],
        }),
      }).catch(() => undefined);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [state?.diagnostics.buildId]);

  const setOptOut = async (optOut: boolean) => {
    const res = await fetch("/api/monitor/rollout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_opt_out", optOut }),
    });
    if (!res.ok) {
      setMsg("Could not update opt-out");
      return;
    }
    setMsg(optOut ? "Monitor opt-out saved — using Feed / legacy." : "Opt-out cleared.");
    load();
  };

  const sendFeedback = async () => {
    if (!feedback.trim()) return;
    const res = await fetch("/api/monitor/rollout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "feedback",
        category: "ux",
        message: feedback,
        path: typeof window !== "undefined" ? window.location.pathname : null,
        buildId: state?.diagnostics.buildId,
        stage: state?.stage,
      }),
    });
    setMsg(res.ok ? "Feedback recorded. Thank you." : "Feedback failed");
    if (res.ok) setFeedback("");
  };

  if (!state) return null;

  return (
    <div
      className="border-b border-zinc-800 bg-zinc-950/90 px-3 py-2 text-xs text-zinc-300"
      data-guide="monitor-beta-chrome"
      data-testid="monitor-beta-chrome"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium text-zinc-200">Monitor beta</span>
        <span className="text-zinc-500">
          {state.enabled ? "active for your account" : `unavailable (${state.reason})`}
          {state.stage ? ` · ${state.stage}` : ""}
        </span>
        <Link
          href={state.fallback.feedHref}
          className="text-sky-400/90 hover:text-sky-300 underline-offset-2 hover:underline"
        >
          Open Feed
        </Link>
        <Link
          href={state.fallback.legacyHref}
          className="text-sky-400/90 hover:text-sky-300 underline-offset-2 hover:underline"
        >
          Old dashboard
        </Link>
        {state.enabled ? (
          <button
            type="button"
            className="rounded border border-zinc-700 px-2 py-0.5 hover:bg-zinc-800"
            onClick={() => void setOptOut(true)}
          >
            Opt out of Monitor beta
          </button>
        ) : state.optedOut ? (
          <button
            type="button"
            className="rounded border border-zinc-700 px-2 py-0.5 hover:bg-zinc-800"
            onClick={() => void setOptOut(false)}
          >
            Rejoin Monitor beta
          </button>
        ) : null}
        <span className="ml-auto font-mono text-[10px] text-zinc-600">
          build {state.diagnostics.buildId}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          className="min-w-[12rem] flex-1 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs"
          placeholder="Beta feedback (no private financial notes)"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          maxLength={2000}
        />
        <button
          type="button"
          className="rounded border border-zinc-700 px-2 py-1 hover:bg-zinc-800"
          onClick={() => void sendFeedback()}
        >
          Send feedback
        </button>
        {msg ? <span className="text-amber-300/90">{msg}</span> : null}
      </div>
      <p className="mt-1 text-[10px] text-zinc-600">
        Technical errors are captured without private notes. Beta observations are
        not service guarantees.
      </p>
    </div>
  );
}
