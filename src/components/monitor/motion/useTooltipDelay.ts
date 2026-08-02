"use client";

import { useEffect, useState } from "react";
import { MON_TOOLTIP_DELAY_MS } from "./motion-tokens.ts";

/**
 * Delay tooltip appearance so cursors sweeping the field do not spam tooltips.
 * Clear is immediate when the tip target becomes null.
 */
export function useTooltipDelay<T>(
  target: T | null,
  delayMs: number = MON_TOOLTIP_DELAY_MS
): T | null {
  const [shown, setShown] = useState<T | null>(null);

  useEffect(() => {
    if (target == null) {
      setShown(null);
      return;
    }
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(target);
      return;
    }
    const t = window.setTimeout(() => setShown(target), delayMs);
    return () => window.clearTimeout(t);
  }, [target, delayMs]);

  return shown;
}
