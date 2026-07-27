/**
 * Supported US equity regular-session market hours (ET).
 * Used for feed-availability-during-market-hours indicator.
 */

const ET = "America/New_York";

function partsInEt(d: Date): { y: number; m: number; day: number; h: number; min: number; dow: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const dowMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    y: Number(map.year),
    m: Number(map.month),
    day: Number(map.day),
    h: Number(map.hour === "24" ? "0" : map.hour),
    min: Number(map.minute),
    dow: dowMap[map.weekday ?? ""] ?? 0,
  };
}

/** Regular session 09:30–16:00 ET, Mon–Fri (holidays not modelled here). */
export function isSupportedMarketMinute(at: Date): boolean {
  const p = partsInEt(at);
  if (p.dow === 0 || p.dow === 6) return false;
  const mins = p.h * 60 + p.min;
  return mins >= 9 * 60 + 30 && mins < 16 * 60;
}

export function countMarketMinutes(
  windowStart: Date,
  windowEnd: Date
): number {
  let n = 0;
  const cur = new Date(windowStart.getTime());
  cur.setUTCSeconds(0, 0);
  while (cur < windowEnd) {
    if (isSupportedMarketMinute(cur)) n += 1;
    cur.setUTCMinutes(cur.getUTCMinutes() + 1);
  }
  return n;
}

/**
 * Maintenance exclusion: only when announced in advance (announcedAt < startedAt)
 * and overlapping the window.
 */
export function maintenanceOverlapMinutes(input: {
  windowStart: Date;
  windowEnd: Date;
  maintenance: Array<{
    startedAt: Date;
    endedAt: Date | null;
    announcedMaintenance: boolean;
    announcedAt: Date | null;
  }>;
  marketHoursOnly?: boolean;
}): number {
  let total = 0;
  for (const m of input.maintenance) {
    if (!m.announcedMaintenance) continue;
    if (!m.announcedAt || !(m.announcedAt.getTime() < m.startedAt.getTime())) {
      continue; // not announced in advance — do not exclude
    }
    const start = Math.max(input.windowStart.getTime(), m.startedAt.getTime());
    const endMs = m.endedAt
      ? m.endedAt.getTime()
      : input.windowEnd.getTime();
    const end = Math.min(input.windowEnd.getTime(), endMs);
    if (end <= start) continue;
    if (!input.marketHoursOnly) {
      total += Math.floor((end - start) / 60_000);
      continue;
    }
    const cur = new Date(start);
    cur.setUTCSeconds(0, 0);
    while (cur.getTime() < end) {
      if (isSupportedMarketMinute(cur)) total += 1;
      cur.setUTCMinutes(cur.getUTCMinutes() + 1);
    }
  }
  return total;
}
