/**
 * Build financial state dimensions from normalized MetricObservation rows.
 */

import type { NormalizedMetricObservation } from "../metrics/types.ts";
import { computeYoyDelta } from "../metrics/deltas.ts";
import type { StateDimension, StateEvidenceLink, StateValuePoint } from "./types.ts";
import { trendFromChange, formatSignedPercent } from "./trend.ts";

function latestForKey(
  observations: NormalizedMetricObservation[],
  key: string
): NormalizedMetricObservation | null {
  return (
    observations
      .filter((o) => o.metricKey === key && o.value != null && Number.isFinite(o.value))
      .sort((a, b) => {
        const ae = a.periodEnd?.getTime() ?? 0;
        const be = b.periodEnd?.getTime() ?? 0;
        return be - ae;
      })[0] ?? null
  );
}

function evidenceFromObs(o: NormalizedMetricObservation | null): StateEvidenceLink[] {
  if (!o) return [];
  return [
    {
      category: "sec_xbrl_fact",
      linkedModel: "metric_observation",
      linkedId: null,
      sourceUrl: o.sourceUrl,
      availability:
        o.sourceType === "derived"
          ? "derived"
          : o.value == null
            ? "unknown"
            : "reported",
      metricKey: o.metricKey,
    },
  ];
}

function valuePoint(o: NormalizedMetricObservation | null, label: string): StateValuePoint | null {
  if (!o || o.value == null) return null;
  return {
    label,
    value: o.value,
    unit: o.unit,
    periodLabel: o.periodLabel,
    asOf: o.periodEnd?.toISOString() ?? o.filedAt?.toISOString() ?? null,
  };
}

function yoyPct(
  observations: NormalizedMetricObservation[],
  key: string
): number | null {
  const current = latestForKey(observations, key);
  if (!current) return null;
  const delta = computeYoyDelta(current, observations);
  return delta.percentChange;
}

function yoyBps(
  observations: NormalizedMetricObservation[],
  key: string
): number | null {
  const current = latestForKey(observations, key);
  if (!current) return null;
  const delta = computeYoyDelta(current, observations);
  return delta.bpsChange;
}

export function buildGrowthDimension(
  observations: NormalizedMetricObservation[]
): StateDimension {
  const revenue = latestForKey(observations, "revenue");
  const pct = yoyPct(observations, "revenue");
  const trend = trendFromChange({ percentChange: pct });
  const values = [valuePoint(revenue, "Latest revenue")].filter(Boolean) as StateValuePoint[];
  const pctLabel = formatSignedPercent(pct);
  return {
    id: "growth",
    label: "Growth",
    summary:
      revenue && pctLabel
        ? `Revenue ${pctLabel} YoY (${revenue.periodLabel ?? "latest period"})`
        : revenue
          ? `Revenue reported for ${revenue.periodLabel ?? "latest period"}`
          : "Revenue unavailable from stored SEC facts",
    trend,
    values,
    latestObservationDate: revenue?.periodEnd?.toISOString() ?? null,
    evidence: evidenceFromObs(revenue),
    status: revenue ? (pct != null ? "ready" : "partial") : "unknown",
    unavailableReason: revenue ? null : "No comparable revenue observation in database",
  };
}

export function buildProfitabilityDimension(
  observations: NormalizedMetricObservation[]
): StateDimension {
  const grossMargin = latestForKey(observations, "gross_margin");
  const opMargin = latestForKey(observations, "operating_margin");
  const opIncome = latestForKey(observations, "operating_income");
  const gmBps = yoyBps(observations, "gross_margin");
  const omBps = yoyBps(observations, "operating_margin");
  const trend = trendFromChange({
    percentChange: null,
    bpsChange:
      gmBps != null && omBps != null
        ? (gmBps + omBps) / 2
        : gmBps ?? omBps,
  });
  const values = [
    valuePoint(grossMargin, "Gross margin"),
    valuePoint(opMargin, "Operating margin"),
    valuePoint(opIncome, "Operating income"),
  ].filter(Boolean) as StateValuePoint[];
  const hasAny = grossMargin || opMargin || opIncome;
  return {
    id: "profitability",
    label: "Profitability",
    summary: hasAny
      ? `Margins and operating income from latest stored quarter`
      : "Profitability metrics unavailable",
    trend: hasAny ? trend : "unknown",
    values,
    latestObservationDate:
      grossMargin?.periodEnd?.toISOString() ??
      opIncome?.periodEnd?.toISOString() ??
      null,
    evidence: [
      ...evidenceFromObs(grossMargin),
      ...evidenceFromObs(opMargin),
    ],
    status: hasAny ? "ready" : "unknown",
    unavailableReason: hasAny ? null : "No gross margin or operating income in database",
  };
}

export function buildCashDimension(
  observations: NormalizedMetricObservation[]
): StateDimension {
  const cash = latestForKey(observations, "cash");
  const ocf = latestForKey(observations, "operating_cash_flow");
  const fcf = latestForKey(observations, "free_cash_flow");
  const ocfPct = yoyPct(observations, "operating_cash_flow");
  const trend = trendFromChange({ percentChange: ocfPct ?? yoyPct(observations, "cash") });
  const values = [
    valuePoint(cash, "Cash"),
    valuePoint(ocf, "Operating cash flow"),
    valuePoint(fcf, "Free cash flow"),
  ].filter(Boolean) as StateValuePoint[];
  const hasAny = cash || ocf || fcf;
  return {
    id: "cash",
    label: "Cash / Cash flow",
    summary: hasAny
      ? "Cash and cash-flow from stored SEC CompanyFacts"
      : "Cash-flow metrics unavailable",
    trend: hasAny ? trend : "unknown",
    values,
    latestObservationDate: cash?.periodEnd?.toISOString() ?? ocf?.periodEnd?.toISOString() ?? null,
    evidence: [...evidenceFromObs(cash), ...evidenceFromObs(ocf)],
    status: hasAny ? "ready" : "unknown",
    unavailableReason: hasAny ? null : "No cash or cash-flow observations",
  };
}

export function buildBalanceSheetDimension(
  observations: NormalizedMetricObservation[]
): StateDimension {
  const debt = latestForKey(observations, "total_debt");
  const cash = latestForKey(observations, "cash");
  const debtPct = yoyPct(observations, "total_debt");
  const trend = trendFromChange({ percentChange: debtPct, lowerIsBetter: true });
  const values = [
    valuePoint(debt, "Total debt"),
    valuePoint(cash, "Cash"),
  ].filter(Boolean) as StateValuePoint[];
  const hasAny = debt || cash;
  return {
    id: "balance_sheet",
    label: "Balance sheet",
    summary: hasAny ? "Debt and cash from stored observations" : "Balance sheet metrics unavailable",
    trend: debt ? trend : "unknown",
    values,
    latestObservationDate: debt?.periodEnd?.toISOString() ?? cash?.periodEnd?.toISOString() ?? null,
    evidence: evidenceFromObs(debt),
    status: hasAny ? (debt ? "ready" : "partial") : "unknown",
    unavailableReason: hasAny ? null : "No debt or cash observations",
  };
}

export function buildShareStructureDimension(
  observations: NormalizedMetricObservation[]
): StateDimension {
  const shares = latestForKey(observations, "shares_outstanding") ??
    latestForKey(observations, "diluted_shares");
  const pct = yoyPct(observations, shares?.metricKey ?? "shares_outstanding");
  const trend = trendFromChange({ percentChange: pct, lowerIsBetter: true, thresholdPct: 3 });
  const values = [valuePoint(shares, "Shares outstanding")].filter(Boolean) as StateValuePoint[];
  const pctLabel = formatSignedPercent(pct);
  return {
    id: "share_structure",
    label: "Share structure",
    summary: shares
      ? pctLabel
        ? `Share count ${pctLabel} YoY`
        : `Shares outstanding as of ${shares.periodLabel ?? "latest filing"}`
      : "Share count unavailable",
    trend: shares ? trend : "unknown",
    values,
    latestObservationDate: shares?.periodEnd?.toISOString() ?? null,
    evidence: evidenceFromObs(shares),
    status: shares ? "ready" : "unknown",
    unavailableReason: shares ? null : "No shares-outstanding observation",
  };
}
