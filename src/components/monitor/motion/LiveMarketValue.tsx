"use client";

import { useEffect, useRef, useState } from "react";
import {
  decideValueFlash,
  type LiveValueFlashKind,
} from "./live-value-policy.ts";
import {
  MON_VALUE_COALESCE_MS,
  MON_VALUE_FLASH_MS,
} from "./motion-tokens.ts";

export interface LiveMarketValueProps {
  value: string;
  warn?: boolean;
  risk?: boolean;
  accent?: boolean;
  /** Stronger one-shot emphasis (halt / critical catalyst) — not for every tick. */
  criticalOnceKey?: string | null;
  testId?: string;
  className?: string;
}

/**
 * Displays a market figure with brief directional text highlight.
 * Coalesces rapid ticks; skips low-significance noise; never flashes the row.
 */
export function LiveMarketValue({
  value,
  warn,
  risk,
  accent,
  criticalOnceKey,
  testId,
  className,
}: LiveMarketValueProps) {
  const baselineRef = useRef(value);
  const shownRef = useRef(value);
  const windowStartRef = useRef(0);
  const criticalSeenRef = useRef<string | null>(null);
  const [flash, setFlash] = useState<LiveValueFlashKind>("none");

  useEffect(() => {
    const critical =
      !!criticalOnceKey && criticalSeenRef.current !== criticalOnceKey;
    if (value === shownRef.current && !critical) return;

    if (critical && criticalOnceKey) {
      criticalSeenRef.current = criticalOnceKey;
    }

    const now = Date.now();
    if (windowStartRef.current === 0) windowStartRef.current = now;

    const elapsed = now - windowStartRef.current;
    const decision = decideValueFlash({
      baseline: baselineRef.current,
      previousShown: shownRef.current,
      next: value,
      coalesceElapsedMs: elapsed,
      critical,
    });

    shownRef.current = value;

    if (!decision.shouldFlash) {
      if (elapsed >= MON_VALUE_COALESCE_MS) {
        baselineRef.current = value;
        windowStartRef.current = now;
      }
      return;
    }

    setFlash((prev) => (prev === decision.kind ? prev : decision.kind));
    const t = window.setTimeout(
      () => setFlash((f) => (f === "none" ? f : "none")),
      MON_VALUE_FLASH_MS
    );
    if (elapsed >= MON_VALUE_COALESCE_MS || critical) {
      baselineRef.current = decision.baseline;
      windowStartRef.current = now;
      return () => window.clearTimeout(t);
    }
    const settle = window.setTimeout(() => {
      baselineRef.current = value;
      windowStartRef.current = Date.now();
    }, MON_VALUE_COALESCE_MS - elapsed);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(settle);
    };
  }, [value, criticalOnceKey]);

  const unavailable = value === "Unavailable";
  return (
    <span
      className={["tt-live-value", "tt-num", className].filter(Boolean).join(" ")}
      data-testid={testId}
      data-unavailable={unavailable ? "true" : "false"}
      data-warn={warn ? "true" : "false"}
      data-risk={risk ? "true" : "false"}
      data-accent={accent ? "true" : "false"}
      data-flash={flash === "none" ? "false" : flash}
    >
      {value}
    </span>
  );
}
