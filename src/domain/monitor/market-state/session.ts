/**
 * US equity session segments in America/New_York (pure; inject nowMs).
 * Segments: premarket | open_auction | regular | after_hours | closed
 */

export type SessionSegment =
  | "premarket"
  | "open_auction"
  | "regular"
  | "after_hours"
  | "closed";

export interface SessionContext {
  segment: SessionSegment;
  /** Minutes since midnight ET */
  etMinutes: number;
  weekday: number; // 0=Sun
  /** Session day key YYYY-MM-DD in ET */
  sessionDate: string;
}

function etParts(nowMs: number): {
  weekday: number;
  minutes: number;
  date: string;
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = fmt.formatToParts(new Date(nowMs));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = Number(get("hour") === "24" ? "0" : get("hour"));
  const minute = Number(get("minute"));
  const month = get("month");
  const day = get("day");
  const year = get("year");
  const wd = get("weekday");
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    weekday: map[wd] ?? 0,
    minutes: hour * 60 + minute,
    date: `${year}-${month}-${day}`,
  };
}

/**
 * Classify session. Open auction ≈ 09:30–09:35 ET (approximate; not exchange official).
 */
export function getSessionContext(nowMs: number): SessionContext {
  const { weekday, minutes, date } = etParts(nowMs);
  if (weekday === 0 || weekday === 6) {
    return { segment: "closed", etMinutes: minutes, weekday, sessionDate: date };
  }
  // Premarket 04:00–09:30
  if (minutes >= 4 * 60 && minutes < 9 * 60 + 30) {
    return {
      segment: "premarket",
      etMinutes: minutes,
      weekday,
      sessionDate: date,
    };
  }
  // Open auction window 09:30–09:35
  if (minutes >= 9 * 60 + 30 && minutes < 9 * 60 + 35) {
    return {
      segment: "open_auction",
      etMinutes: minutes,
      weekday,
      sessionDate: date,
    };
  }
  // Regular 09:35–16:00
  if (minutes >= 9 * 60 + 35 && minutes < 16 * 60) {
    return {
      segment: "regular",
      etMinutes: minutes,
      weekday,
      sessionDate: date,
    };
  }
  // After-hours 16:00–20:00
  if (minutes >= 16 * 60 && minutes < 20 * 60) {
    return {
      segment: "after_hours",
      etMinutes: minutes,
      weekday,
      sessionDate: date,
    };
  }
  return { segment: "closed", etMinutes: minutes, weekday, sessionDate: date };
}

/** Expected session volume factor for RVol (aligned with desk heuristics). */
export function sessionVolumeFactor(segment: SessionSegment, etMinutes: number): number {
  if (segment === "premarket") return 0.15;
  if (segment === "after_hours") return 0.1;
  if (segment === "closed") return 0.35;
  if (segment === "open_auction") return 0.25;
  const sessionStart = 9 * 60 + 30;
  const sessionEnd = 16 * 60;
  const elapsed = Math.max(15, etMinutes - sessionStart);
  const total = sessionEnd - sessionStart;
  return Math.min(0.95, Math.max(0.2, elapsed / total));
}
