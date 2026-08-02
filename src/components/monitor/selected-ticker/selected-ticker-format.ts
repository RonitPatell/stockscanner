import type {
  MonitorAvailNumber,
  MonitorAvailText,
} from "./selected-ticker-types.ts";

export function availNum(
  value: number | null | undefined,
  opts?: { estimated?: boolean; stale?: boolean; note?: string }
): MonitorAvailNumber {
  if (value == null || !Number.isFinite(value)) {
    return {
      value: null,
      availability: "unavailable",
      note: opts?.note ?? "unavailable",
    };
  }
  if (opts?.stale) {
    return { value, availability: "stale", note: opts.note };
  }
  if (opts?.estimated) {
    return { value, availability: "estimated", note: opts.note };
  }
  return { value, availability: "ok", note: opts?.note };
}

export function unavailableNum(note = "unavailable"): MonitorAvailNumber {
  return { value: null, availability: "unavailable", note };
}

export function availText(
  value: string | null | undefined,
  opts?: { estimated?: boolean; stale?: boolean; note?: string }
): MonitorAvailText {
  if (value == null || !String(value).trim()) {
    return {
      value: null,
      availability: "unavailable",
      note: opts?.note ?? "unavailable",
    };
  }
  const v = String(value).trim();
  if (opts?.stale) return { value: v, availability: "stale", note: opts.note };
  if (opts?.estimated) {
    return { value: v, availability: "estimated", note: opts.note };
  }
  return { value: v, availability: "ok", note: opts?.note };
}

export function unavailableText(note = "unavailable"): MonitorAvailText {
  return { value: null, availability: "unavailable", note };
}

/**
 * Format a numeric field. Always marks unavailable explicitly —
 * never invents values and never substitutes another price.
 */
export function formatMonitorNumber(
  field: MonitorAvailNumber | null | undefined,
  opts?: { digits?: number; suffix?: string; prefix?: string; compact?: boolean }
): string {
  if (!field || field.availability === "unavailable" || field.value == null) {
    return "Unavailable";
  }
  const prefix = opts?.prefix ?? "";
  const suffix = opts?.suffix ?? "";
  const n = field.value;
  let body: string;
  if (opts?.compact) {
    const abs = Math.abs(n);
    if (abs >= 1_000_000_000) body = `${(n / 1_000_000_000).toFixed(2)}B`;
    else if (abs >= 1_000_000) body = `${(n / 1_000_000).toFixed(2)}M`;
    else if (abs >= 1_000) body = `${(n / 1_000).toFixed(1)}K`;
    else body = n.toFixed(opts.digits ?? 0);
  } else {
    const d = opts?.digits ?? 2;
    const sign = n > 0 && opts?.suffix === "%" ? "+" : "";
    body = `${sign}${n.toFixed(d)}`;
  }
  const note =
    field.availability === "estimated"
      ? " (est.)"
      : field.availability === "stale"
        ? " (stale)"
        : "";
  return `${prefix}${body}${suffix}${note}`;
}

export function formatMonitorText(
  field: MonitorAvailText | null | undefined
): string {
  if (!field || field.availability === "unavailable" || field.value == null) {
    return "Unavailable";
  }
  const note =
    field.availability === "estimated"
      ? " (est.)"
      : field.availability === "stale"
        ? " (stale)"
        : "";
  return `${field.value}${note}`;
}

/** Stick last-known numeric field across live ticks — never invents from another field. */
export function stickMonitorNumber(
  prev: MonitorAvailNumber | undefined,
  next: MonitorAvailNumber
): MonitorAvailNumber {
  if (next.availability !== "unavailable" && next.value != null) return next;
  if (prev && prev.availability !== "unavailable" && prev.value != null) {
    return prev.availability === "ok"
      ? { ...prev, availability: "stale" }
      : prev;
  }
  return next;
}

export function stickMonitorText(
  prev: MonitorAvailText | undefined,
  next: MonitorAvailText
): MonitorAvailText {
  if (next.availability !== "unavailable" && next.value != null) return next;
  if (prev && prev.availability !== "unavailable" && prev.value != null) {
    return prev.availability === "ok"
      ? { ...prev, availability: "stale" }
      : prev;
  }
  return next;
}

export function formatAgeLabel(sec: number | null | undefined): string | null {
  if (sec == null || !Number.isFinite(sec)) return null;
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86_400) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 86_400)}d`;
}

export function formatEtTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return (
    new Date(t).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "America/New_York",
    }) + " ET"
  );
}
