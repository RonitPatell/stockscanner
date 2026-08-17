/**
 * Business Change Fingerprint — multi-window trend grid from persisted metrics.
 */

import type { NormalizedMetricObservation } from "../metrics/types.ts";
import { computeYoyDelta } from "../metrics/deltas.ts";
import type { StateTrend } from "./types.ts";
import { trendFromChange } from "./trend.ts";

export const FINGERPRINT_VERSION = "1.0.0";

export type FingerprintWindow = "3y" | "1y" | "latest";

export type FingerprintDimensionKey =
  | "revenue"
  | "revenue_growth"
  | "gross_margin"
  | "operating_margin"
  | "operating_cash_flow"
  | "free_cash_flow"
  | "cash"
  | "total_debt"
  | "shares_outstanding"
  | "capital_risk";

export type FingerprintCell = {
  window: FingerprintWindow;
  trend: StateTrend;
  /** Arrow glyph for UI — empty when unknown */
  arrow: "" | "↑" | "→" | "↓" | "?";
  percentChange: number | null;
  bpsChange: number | null;
  periodLabel: string | null;
  comparable: boolean;
  evidenceMetricKey: string;
};

export type FingerprintRow = {
  key: FingerprintDimensionKey;
  label: string;
  cells: FingerprintCell[];
};

export type BusinessChangeFingerprint = {
  symbol: string;
  version: string;
  asOf: string;
  rows: FingerprintRow[];
};

const ROWS: { key: FingerprintDimensionKey; label: string; metricKey: string; lowerIsBetter?: boolean; margin?: boolean }[] = [
  { key: "revenue", label: "Revenue", metricKey: "revenue" },
  { key: "revenue_growth", label: "Revenue growth", metricKey: "revenue" },
  { key: "gross_margin", label: "Gross margin", metricKey: "gross_margin", margin: true },
  { key: "operating_margin", label: "Operating margin", metricKey: "operating_margin", margin: true },
  { key: "operating_cash_flow", label: "Operating cash flow", metricKey: "operating_cash_flow" },
  { key: "free_cash_flow", label: "Free cash flow", metricKey: "free_cash_flow" },
  { key: "cash", label: "Cash", metricKey: "cash" },
  { key: "total_debt", label: "Debt", metricKey: "total_debt", lowerIsBetter: true },
  { key: "shares_outstanding", label: "Share count", metricKey: "shares_outstanding", lowerIsBetter: true },
];

function arrowForTrend(t: StateTrend): FingerprintCell["arrow"] {
  switch (t) {
    case "improving":
      return "↑";
    case "stable":
      return "→";
    case "deteriorating":
      return "↓";
    case "mixed":
      return "?";
    default:
      return "";
  }
}

function latestAtOffset(
  observations: NormalizedMetricObservation[],
  metricKey: string,
  yearsBack: number
): NormalizedMetricObservation | null {
  const rows = observations
    .filter((o) => o.metricKey === metricKey && o.value != null && Number.isFinite(o.value))
    .sort((a, b) => (b.periodEnd?.getTime() ?? 0) - (a.periodEnd?.getTime() ?? 0));
  if (rows.length === 0) return null;
  if (yearsBack === 0) return rows[0]!;
  const anchor = rows[0]!;
  if (!anchor.periodEnd) return null;
  const targetYear = (anchor.fiscalYear ?? anchor.periodEnd.getUTCFullYear()) - yearsBack;
  const hit =
    rows.find(
      (r) =>
        r.fiscalYear === targetYear &&
        r.fiscalPeriod === anchor.fiscalPeriod
    ) ??
    rows.find((r) => (r.fiscalYear ?? 0) <= targetYear);
  return hit ?? null;
}

function cellForWindow(
  observations: NormalizedMetricObservation[],
  metricKey: string,
  window: FingerprintWindow,
  lowerIsBetter?: boolean,
  margin?: boolean
): FingerprintCell {
  const current =
    window === "latest"
      ? latestAtOffset(observations, metricKey, 0)
      : window === "1y"
        ? latestAtOffset(observations, metricKey, 0)
        : latestAtOffset(observations, metricKey, 0);
  if (!current) {
    return {
      window,
      trend: "unknown",
      arrow: "",
      percentChange: null,
      bpsChange: null,
      periodLabel: null,
      comparable: false,
      evidenceMetricKey: metricKey,
    };
  }

  const yearsBack = window === "3y" ? 3 : window === "1y" ? 1 : 0;
  let trend: StateTrend = "unknown";
  let pct: number | null = null;
  let bps: number | null = null;
  let comparable = false;

  if (yearsBack === 0) {
    const delta = computeYoyDelta(current, observations);
    pct = delta.percentChange;
    bps = delta.bpsChange;
    comparable = delta.comparable;
    trend = margin
      ? trendFromChange({ percentChange: null, bpsChange: bps, lowerIsBetter })
      : trendFromChange({ percentChange: pct, lowerIsBetter });
  } else {
    const prior = latestAtOffset(observations, metricKey, yearsBack);
    if (prior && current.value != null && prior.value != null) {
      pct =
        prior.value !== 0
          ? ((current.value - prior.value) / Math.abs(prior.value)) * 100
          : null;
      comparable = true;
      if (margin && pct != null) {
        bps = (current.value - prior.value) * 100;
        trend = trendFromChange({ percentChange: null, bpsChange: bps, lowerIsBetter });
      } else {
        trend = trendFromChange({ percentChange: pct, lowerIsBetter });
      }
    }
  }

  return {
    window,
    trend,
    arrow: arrowForTrend(trend),
    percentChange: pct,
    bpsChange: bps,
    periodLabel: current.periodLabel,
    comparable,
    evidenceMetricKey: metricKey,
  };
}

export function buildBusinessChangeFingerprint(
  symbol: string,
  observations: NormalizedMetricObservation[]
): BusinessChangeFingerprint {
  const rows: FingerprintRow[] = ROWS.map((spec) => ({
    key: spec.key,
    label: spec.label,
    cells: (["3y", "1y", "latest"] as FingerprintWindow[]).map((w) =>
      cellForWindow(
        observations,
        spec.metricKey,
        w,
        spec.lowerIsBetter,
        spec.margin
      )
    ),
  }));

  return {
    symbol: symbol.trim().toUpperCase(),
    version: FINGERPRINT_VERSION,
    asOf: new Date().toISOString(),
    rows,
  };
}

export async function getBusinessChangeFingerprintForSymbol(
  symbol: string
): Promise<BusinessChangeFingerprint> {
  const { loadMetricObservationsForSymbol } = await import("../metrics/load.ts");
  const observations = await loadMetricObservationsForSymbol(symbol);
  return buildBusinessChangeFingerprint(symbol, observations);
}
