import type { AdaptiveIntervals, MarketPhase } from "./types.ts";

/** US equity session phase for adaptive polling (America/New_York). */
export function getMarketPhase(now = new Date()): MarketPhase {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const mins = hour * 60 + minute;

  if (weekday === "Sat" || weekday === "Sun") return "overnight";
  if (mins >= 4 * 60 && mins < 9 * 60 + 30) return "premarket";
  if (mins >= 9 * 60 + 30 && mins < 16 * 60) return "regular";
  if (mins >= 16 * 60 && mins < 20 * 60) return "afterhours";
  return "overnight";
}

export function intervalForPhase(
  intervals: AdaptiveIntervals,
  phase: MarketPhase = getMarketPhase()
): number {
  return intervals[phase];
}

/** Exponential backoff with full jitter. attempt is 1-based. */
export function backoffWithJitterMs(
  attempt: number,
  opts: { baseMs?: number; maxMs?: number; factor?: number } = {}
): number {
  const baseMs = opts.baseMs ?? 1_000;
  const maxMs = opts.maxMs ?? 5 * 60_000;
  const factor = opts.factor ?? 2;
  const exp = Math.min(maxMs, baseMs * Math.pow(factor, Math.max(0, attempt - 1)));
  return Math.floor(Math.random() * (exp + 1));
}
