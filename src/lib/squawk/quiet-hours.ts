import type { QuietHours } from "./types.ts";

/** Minutes since midnight in America/New_York. */
export function etMinutesSinceMidnight(nowMs = Date.now()): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(new Date(nowMs));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

/**
 * Quiet hours may wrap midnight (e.g. 22:00–07:00).
 */
export function isInQuietHours(
  quiet: QuietHours,
  nowMs = Date.now()
): boolean {
  if (!quiet.enabled) return false;
  const m = etMinutesSinceMidnight(nowMs);
  const { startMin, endMin } = quiet;
  if (startMin === endMin) return true; // full-day mute when equal
  if (startMin < endMin) {
    return m >= startMin && m < endMin;
  }
  // wraps midnight
  return m >= startMin || m < endMin;
}
