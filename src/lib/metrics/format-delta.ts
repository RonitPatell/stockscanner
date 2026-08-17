/**
 * Display formatting for Quarterly Delta rows — never invent zeros.
 */

import type { FinancialMetricKey } from "./types.ts";
import type { QuarterlyDeltaRow } from "./quarterly-delta.ts";

export function formatMetricValue(
  metricKey: FinancialMetricKey,
  value: number | null | undefined
): string {
  if (value == null || !Number.isFinite(value)) return "—";

  if (metricKey === "gross_margin" || metricKey === "operating_margin") {
    return `${value.toFixed(1)}%`;
  }

  if (metricKey === "diluted_shares" || metricKey === "shares_outstanding") {
    if (Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
    if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
    if (Math.abs(value) >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
    return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }

  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function formatAbsoluteChange(
  metricKey: FinancialMetricKey,
  value: number | null | undefined
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value === 0) return "0";

  if (metricKey === "gross_margin" || metricKey === "operating_margin") {
    const sign = value > 0 ? "+" : "";
    return `${sign}${value.toFixed(1)} pp`;
  }

  const formatted = formatMetricValue(metricKey, Math.abs(value));
  return value > 0 ? `+${formatted}` : `-${formatted.replace(/^-/, "")}`;
}

export function formatRelativeChange(row: QuarterlyDeltaRow): string {
  if (!row.comparable) return "—";
  const isMargin =
    row.metricKey === "gross_margin" || row.metricKey === "operating_margin";
  if (isMargin) {
    if (row.bpsChange == null) return "—";
    const sign = row.bpsChange > 0 ? "+" : "";
    return `${sign}${Math.round(row.bpsChange)} bps`;
  }
  if (row.percentChange == null) return "—";
  const sign = row.percentChange > 0 ? "+" : "";
  return `${sign}${row.percentChange.toFixed(1)}%`;
}

export function formatFiledDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
