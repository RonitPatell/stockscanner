/**
 * Decision Drawer presentation helpers.
 * Does not change classification — formats projected Decision Card fields only.
 */

import type { DecisionRiskFlag } from "../decision-card/types.ts";
import type { AvailableNumber } from "../decision-card/types.ts";
import { presentReactionStage, presentTradeability } from "../judgment/present.ts";

export const DECISION_DRAWER_VERSION = "decision-drawer-v1.1";

export const DECISION_DRAWER_SECTIONS = [
  "event",
  "reaction",
  "tradeability",
  "primary-risks",
  "evidence",
  "optional-analysis",
] as const;

export type DecisionDrawerSectionId = (typeof DECISION_DRAWER_SECTIONS)[number];

/** Compact volume / notional formatting */
export function drawerCompactNumber(
  n: number | null | undefined,
  opts?: { prefix?: string; digits?: number }
): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  const prefix = opts?.prefix ?? "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${prefix}${(n / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${prefix}${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${prefix}${(n / 1_000).toFixed(1)}K`;
  return `${prefix}${n.toFixed(opts?.digits ?? 0)}`;
}

/**
 * Format a numeric field. Returns null when empty so the UI can omit the row —
 * never invents values, never paints "Unavailable."
 */
export function drawerField(
  field: AvailableNumber | null | undefined,
  opts?: { digits?: number; suffix?: string; prefix?: string; compact?: boolean }
): string | null {
  if (!field || field.availability === "unavailable" || field.value == null) {
    return null;
  }
  if (opts?.compact) {
    const c = drawerCompactNumber(field.value, {
      prefix: opts.prefix,
      digits: opts.digits,
    });
    if (!c) return null;
    const note =
      field.availability === "estimated"
        ? " (est.)"
        : field.availability === "stale"
          ? " (stale)"
          : "";
    return `${c}${opts.suffix ?? ""}${note}`;
  }
  const d = opts?.digits ?? 2;
  const prefix = opts?.prefix ?? "";
  const suffix = opts?.suffix ?? "";
  const n = field.value;
  const sign = n > 0 && opts?.suffix === "%" ? "+" : "";
  const note =
    field.availability === "estimated"
      ? " (est.)"
      : field.availability === "stale"
        ? " (stale)"
        : "";
  return `${prefix}${sign}${n.toFixed(d)}${suffix}${note}`;
}

export function drawerText(value: string | null | undefined): string | null {
  if (value == null || !String(value).trim()) return null;
  return String(value).trim();
}

export function drawerTime(iso: string | null | undefined): string | null {
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

/** Keep last known numeric field when a newer projection drops it. */
export function stickNumber(
  prev: AvailableNumber | undefined,
  next: AvailableNumber
): AvailableNumber {
  if (next.availability !== "unavailable" && next.value != null) return next;
  if (prev && prev.availability !== "unavailable" && prev.value != null) {
    return prev.availability === "ok" ? { ...prev, availability: "stale" } : prev;
  }
  return next;
}

const RISK_PRIORITY: Record<string, number> = {
  registered_offering: 100,
  active_shelf: 95,
  atm: 90,
  warrants: 85,
  convertible: 80,
  reverse_split: 75,
  already_extended: 70,
  wide_spread: 65,
  stale_news: 60,
  promotional: 55,
  ambiguous_ticker: 50,
  missing_critical: 45,
  halt_language: 40,
};

/** Most important active risks first; inactive omitted from Primary Risks. */
export function sortPrimaryRisks(risks: DecisionRiskFlag[]): DecisionRiskFlag[] {
  return [...risks]
    .filter((r) => r.active)
    .sort((a, b) => {
      const sev = { high: 3, medium: 2, low: 1 };
      const sd = (sev[b.severity] ?? 0) - (sev[a.severity] ?? 0);
      if (sd !== 0) return sd;
      return (RISK_PRIORITY[b.id] ?? 0) - (RISK_PRIORITY[a.id] ?? 0);
    });
}

export function drawerReactionLabel(stage: string | null | undefined): string {
  return presentReactionStage(stage);
}

export function drawerLiquidityLabel(liq: string | null | undefined): string {
  return presentTradeability(liq);
}

export function confirmationLabel(
  confidence: AvailableNumber | null | undefined
): string | null {
  if (!confidence || confidence.availability === "unavailable" || confidence.value == null) {
    return null;
  }
  const v = confidence.value;
  if (v >= 70) return `High (${Math.round(v)})`;
  if (v >= 45) return `Medium (${Math.round(v)})`;
  if (v >= 25) return `Low (${Math.round(v)})`;
  return `Unverified (${Math.round(v)})`;
}

/** Deep-link query param for selected catalyst */
export const DRAWER_CATALYST_PARAM = "cid";

export function catalystIdFromSearchParams(
  params: URLSearchParams | { get(name: string): string | null }
): string | null {
  const raw =
    params.get(DRAWER_CATALYST_PARAM) ??
    params.get("catalystId") ??
    params.get("catalyst");
  if (!raw || !raw.trim()) return null;
  return raw.trim().slice(0, 128);
}

export function writeCatalystDeepLink(catalystId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (catalystId) url.searchParams.set(DRAWER_CATALYST_PARAM, catalystId);
    else url.searchParams.delete(DRAWER_CATALYST_PARAM);
    url.searchParams.delete("catalystId");
    url.searchParams.delete("catalyst");
    window.history.replaceState({}, "", url.toString());
  } catch {
    /* ignore */
  }
}
