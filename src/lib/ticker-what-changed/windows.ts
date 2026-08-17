/**
 * Time windows for company What Changed.
 */

import type { WhatChangedWindow } from "./types.ts";

export function isWhatChangedWindow(v: string): v is WhatChangedWindow {
  return (
    v === "since_last_view" ||
    v === "7d" ||
    v === "30d" ||
    v === "quarter" ||
    v === "1y"
  );
}

/** Start of current calendar quarter (UTC). */
export function startOfCalendarQuarter(now = new Date()): Date {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const qStart = Math.floor(m / 3) * 3;
  return new Date(Date.UTC(y, qStart, 1, 0, 0, 0, 0));
}

/**
 * Resolve `since` for a window.
 * `since_last_view` uses lastViewIso when valid; otherwise falls back to 30d.
 */
export function resolveWhatChangedSince(opts: {
  window: WhatChangedWindow;
  now?: Date;
  /** Client/server last meaningful view ISO */
  lastViewIso?: string | null;
}): {
  since: Date | null;
  until: Date | null;
  effectiveWindow: WhatChangedWindow;
  usedFallbackWindow: boolean;
  fallbackWindow: WhatChangedWindow | null;
} {
  const now = opts.now ?? new Date();
  const until = now;

  if (opts.window === "since_last_view") {
    const parsed = opts.lastViewIso ? new Date(opts.lastViewIso) : null;
    if (parsed && Number.isFinite(parsed.getTime()) && parsed.getTime() < now.getTime()) {
      // Clamp absurdly old "last view" to 1y
      const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      const since = parsed.getTime() < oneYearAgo.getTime() ? oneYearAgo : parsed;
      return {
        since,
        until,
        effectiveWindow: "since_last_view",
        usedFallbackWindow: false,
        fallbackWindow: null,
      };
    }
    const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return {
      since,
      until,
      effectiveWindow: "30d",
      usedFallbackWindow: true,
      fallbackWindow: "30d",
    };
  }

  let ms = 30 * 24 * 60 * 60 * 1000;
  if (opts.window === "7d") ms = 7 * 24 * 60 * 60 * 1000;
  else if (opts.window === "1y") ms = 365 * 24 * 60 * 60 * 1000;
  else if (opts.window === "quarter") {
    return {
      since: startOfCalendarQuarter(now),
      until,
      effectiveWindow: "quarter",
      usedFallbackWindow: false,
      fallbackWindow: null,
    };
  }

  return {
    since: new Date(now.getTime() - ms),
    until,
    effectiveWindow: opts.window,
    usedFallbackWindow: false,
    fallbackWindow: null,
  };
}
