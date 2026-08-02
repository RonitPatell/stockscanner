"use client";

import { useEffect, useRef, useState } from "react";
import type { MonitorConnectionState } from "../monitor-types.ts";
import { MON_RECOVERED_HOLD_MS } from "./motion-tokens.ts";

export type ConnectionChromeState = MonitorConnectionState | "recovered";

function isImpaired(c: MonitorConnectionState): boolean {
  return (
    c === "degraded" ||
    c === "disconnected" ||
    c === "delayed" ||
    c === "partial_outage"
  );
}

export function connectionReason(
  c: ConnectionChromeState,
  providerNotes: string[]
): string {
  if (c === "recovered") return "Stream recovered — back to live.";
  if (c === "live") return "Stream healthy.";
  if (c === "degraded") {
    return (
      providerNotes[0] ??
      "Feed degraded — quotes may be stale or incomplete."
    );
  }
  if (c === "disconnected") {
    return (
      providerNotes[0] ??
      "Disconnected — waiting to reconnect."
    );
  }
  if (c === "delayed") {
    return providerNotes[0] ?? "Delayed data — not real-time.";
  }
  if (c === "partial_outage") {
    return providerNotes[0] ?? "Partial outage — some sources offline.";
  }
  if (c === "loading") return "Connecting…";
  if (c === "empty") return "No symbols in the inspection set.";
  if (c === "error") return "Monitor error — retry or share the diagnostic reference.";
  return "Connection status.";
}

/**
 * Live → steady. Impaired → amber/red with reason.
 * Transition into live from impaired → brief "Recovered", then neutral live.
 */
export function useConnectionChrome(
  connection: MonitorConnectionState,
  providerNotes: string[] = []
): {
  chrome: ConnectionChromeState;
  label: string;
  tone: "live" | "warn" | "danger" | "info" | "recovered";
  reason: string;
  steady: boolean;
} {
  const prev = useRef(connection);
  const [chrome, setChrome] = useState<ConnectionChromeState>(connection);

  useEffect(() => {
    const from = prev.current;
    prev.current = connection;

    if (connection === "live" && isImpaired(from)) {
      setChrome("recovered");
      const t = window.setTimeout(() => setChrome("live"), MON_RECOVERED_HOLD_MS);
      return () => window.clearTimeout(t);
    }

    if (connection !== "live") {
      setChrome(connection);
      return;
    }

    // Stay on recovered until timer clears; ignore redundant live ticks.
    setChrome((cur) => (cur === "recovered" ? cur : "live"));
  }, [connection]);

  const label =
    chrome === "recovered"
      ? "Recovered"
      : chrome === "live"
        ? "Live"
        : chrome === "degraded"
          ? "Degraded"
          : chrome === "disconnected"
            ? "Disconnected"
            : chrome === "delayed"
              ? "Delayed"
              : chrome === "partial_outage"
                ? "Partial outage"
                : chrome === "loading"
                  ? "Connecting"
                  : chrome === "empty"
                    ? "Empty"
                    : chrome === "error"
                      ? "Error"
                      : String(chrome);

  const tone =
    chrome === "recovered"
      ? "recovered"
      : chrome === "live"
        ? "live"
        : chrome === "degraded" || chrome === "delayed" || chrome === "loading"
          ? "warn"
          : chrome === "disconnected" ||
              chrome === "partial_outage" ||
              chrome === "error"
            ? "danger"
            : "info";

  return {
    chrome,
    label,
    tone,
    reason: connectionReason(chrome, providerNotes),
    steady: chrome === "live",
  };
}
