/**
 * Market value highlight policy — directional text flash, coalesce, materiality.
 * Does not invent prices; only decides whether/how to emphasize a display string change.
 */

import {
  MON_VALUE_COALESCE_MS,
  MON_VALUE_MIN_ABS,
  MON_VALUE_MIN_REL,
} from "./motion-tokens.ts";

export type LiveValueFlashKind =
  | "none"
  | "up"
  | "down"
  | "neutral"
  | "critical";

/** Parse a display figure ($1.23, 4.5%, 12x, 180 bps) into a number when possible. */
export function parseDisplayNumber(text: string): number | null {
  if (!text || text === "Unavailable") return null;
  const currency = String.fromCharCode(36); // dollar — avoid `$` in regex literals under strip-types
  const cleaned = text
    .split(currency)
    .join("")
    .replace(/,/g, "")
    .replace(/\s*(bps|x|%|m|k)\s*$/i, "")
    .trim();
  if (!cleaned || cleaned === "—" || cleaned === "·") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function valueFlashDirection(
  prev: string,
  next: string
): Exclude<LiveValueFlashKind, "none" | "critical"> {
  const a = parseDisplayNumber(prev);
  const b = parseDisplayNumber(next);
  if (a == null || b == null) return "neutral";
  if (b > a) return "up";
  if (b < a) return "down";
  return "neutral";
}

/**
 * Skip low-significance ticks so the desk does not strobe on noise.
 * Availability changes and non-numeric label changes always count.
 */
export function isMaterialValueChange(
  prev: string,
  next: string,
  opts?: { minAbs?: number; minRel?: number }
): boolean {
  if (prev === next) return false;
  if (prev === "Unavailable" || next === "Unavailable") return true;

  const a = parseDisplayNumber(prev);
  const b = parseDisplayNumber(next);
  if (a == null || b == null) return true;

  const abs = Math.abs(b - a);
  const minAbs = opts?.minAbs ?? MON_VALUE_MIN_ABS;
  if (abs < minAbs) return false;

  const scale = Math.max(Math.abs(a), Math.abs(b), 1e-9);
  const rel = abs / scale;
  const minRel = opts?.minRel ?? MON_VALUE_MIN_REL;
  // Larger figures need a relative move so noise on big notionals does not flash.
  if (scale >= 0.5 && rel < minRel) return false;
  return true;
}

export interface CoalesceDecision {
  /** Show flash for this coalesced window */
  shouldFlash: boolean;
  kind: LiveValueFlashKind;
  /** Baseline string for the next coalesce window */
  baseline: string;
}

/**
 * Rapid updates coalesce into one flash from window-start → latest.
 * Critical emphasis bypasses materiality and uses stronger kind once.
 */
export function decideValueFlash(input: {
  baseline: string;
  previousShown: string;
  next: string;
  coalesceElapsedMs: number;
  critical?: boolean;
  coalesceWindowMs?: number;
}): CoalesceDecision {
  const windowMs = input.coalesceWindowMs ?? MON_VALUE_COALESCE_MS;

  if (input.critical) {
    return {
      shouldFlash: true,
      kind: "critical",
      baseline: input.next,
    };
  }

  if (input.next === input.previousShown) {
    return {
      shouldFlash: false,
      kind: "none",
      baseline: input.baseline,
    };
  }

  if (!isMaterialValueChange(input.baseline, input.next)) {
    return {
      shouldFlash: false,
      kind: "none",
      baseline: input.baseline,
    };
  }

  const kind = valueFlashDirection(input.baseline, input.next);

  // Inside coalesce window: refresh direction vs original baseline, single flash.
  if (input.coalesceElapsedMs < windowMs && input.baseline !== input.next) {
    return {
      shouldFlash: true,
      kind,
      baseline: input.baseline,
    };
  }

  return {
    shouldFlash: true,
    kind,
    baseline: input.next,
  };
}
