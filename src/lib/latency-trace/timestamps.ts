import { createHash } from "node:crypto";
import type { MarketSession, ProviderTimestampParse, TimestampQuality } from "./types.ts";

/** Parse a provider-supplied publish/update timestamp with quality tagging. */
export function parseProviderTimestamp(
  raw: string | number | Date | null | undefined,
  opts: {
    /** Prefer ARTICLE_UPDATED_TIME when the field is an update stamp (e.g. Atom <updated>). */
    fieldKind?: "published" | "updated" | "created" | "unknown";
    /** Treat unix values as seconds (Finnhub) vs ms. */
    unixUnit?: "seconds" | "milliseconds";
  } = {}
): ProviderTimestampParse {
  const fieldKind = opts.fieldKind ?? "unknown";
  const unixUnit = opts.unixUnit ?? "seconds";

  if (raw == null || raw === "") {
    return { at: null, quality: "MISSING", raw: raw == null ? null : String(raw) };
  }

  let at: Date | null = null;
  if (raw instanceof Date) {
    at = raw;
  } else if (typeof raw === "number") {
    const ms = unixUnit === "milliseconds" ? raw : raw * 1000;
    at = new Date(ms);
  } else {
    const trimmed = String(raw).trim();
    if (!trimmed) return { at: null, quality: "MISSING", raw: trimmed };
    if (/^\d{9,13}$/.test(trimmed)) {
      const n = Number(trimmed);
      const ms = trimmed.length >= 13 || unixUnit === "milliseconds" ? n : n * 1000;
      at = new Date(ms);
    } else {
      at = new Date(trimmed);
    }
  }

  if (!at || !Number.isFinite(at.getTime())) {
    return { at: null, quality: "INVALID", raw: String(raw) };
  }

  // Reject absurd future stamps (>15m) or ancient junk (>5y) as INVALID.
  const now = Date.now();
  const t = at.getTime();
  if (t > now + 15 * 60_000 || t < now - 5 * 365 * 24 * 60 * 60_000) {
    return { at: null, quality: "INVALID", raw: String(raw) };
  }

  let quality: TimestampQuality;
  if (fieldKind === "updated") {
    quality = "ARTICLE_UPDATED_TIME";
  } else if (fieldKind === "published" || fieldKind === "created") {
    quality = "EXACT_PROVIDER";
  } else {
    quality = "ESTIMATED_PROVIDER";
  }

  return { at, quality, raw: typeof raw === "string" ? raw : String(raw) };
}

/** When publisher time is missing, fall back to "now" and mark MISSING. */
export function fallbackPublishNow(): ProviderTimestampParse {
  return { at: new Date(), quality: "MISSING", raw: null };
}

export function urlHash(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  return createHash("sha256").update(url.trim()).digest("hex").slice(0, 32);
}

/** US equity session from an instant (America/New_York). */
export function marketSessionAt(when: Date | null | undefined): MarketSession | null {
  if (!when || !Number.isFinite(when.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(when);

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const mins = hour * 60 + minute;

  if (weekday === "Sat" || weekday === "Sun") return "weekend";
  // Premarket 04:00–09:30 ET
  if (mins >= 4 * 60 && mins < 9 * 60 + 30) return "premarket";
  // Regular 09:30–16:00 ET
  if (mins >= 9 * 60 + 30 && mins < 16 * 60) return "regular";
  // After-hours 16:00–20:00 ET (treat overnight as afterhours for latency)
  return "afterhours";
}

export function diffMs(
  later: Date | null | undefined,
  earlier: Date | null | undefined
): number | null {
  if (!later || !earlier) return null;
  const a = later.getTime();
  const b = earlier.getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round(a - b));
}
