/**
 * Liquidity block: cash, OCF/burn, runway — UNKNOWN when not defensible.
 * Never invent burn or runway from incomplete accounting.
 * Never treat FY / YTD OCF as a quarterly burn.
 */

import { classifyDurationBucket, durationDays } from "../metrics/periods.ts";
import type { CapitalLiquidityBlock } from "./types.ts";

export type LiquidityObservation = {
  metricKey: string;
  value: number | null;
  periodEnd: Date | null;
  periodStart: Date | null;
  fiscalPeriod: string | null;
  sourceUrl: string | null;
  filedAt: Date | null;
};

function isQuarter(fp: string | null): boolean {
  return fp === "Q1" || fp === "Q2" || fp === "Q3" || fp === "Q4";
}

function knownNumber(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** True when the observation looks like a ~quarter window (not FY / YTD). */
export function isQuarterLengthObservation(
  row: LiquidityObservation
): boolean {
  const days = durationDays(row.periodStart, row.periodEnd);
  if (days != null) {
    return classifyDurationBucket(days) === "quarter";
  }
  // Instant / missing duration: only trust explicit Q1–Q4 labels (still weaker).
  return isQuarter(row.fiscalPeriod);
}

function pickLatest(
  rows: LiquidityObservation[],
  key: string,
  preferQuarter: boolean
): LiquidityObservation | null {
  const filtered = rows.filter(
    (r) => r.metricKey === key && knownNumber(r.value)
  );
  if (!filtered.length) return null;
  return [...filtered].sort((a, b) => {
    if (preferQuarter) {
      const aq = isQuarterLengthObservation(a) ? 1 : 0;
      const bq = isQuarterLengthObservation(b) ? 1 : 0;
      if (bq !== aq) return bq - aq;
    }
    return (b.periodEnd?.getTime() ?? 0) - (a.periodEnd?.getTime() ?? 0);
  })[0]!;
}

/**
 * Burn = -OCF when OCF is negative (cash leaving operations).
 * If OCF >= 0, burn is not applicable (company is generating operating cash).
 * If OCF missing/irregular → unknown.
 */
export function estimateOperatingBurn(
  ocf: number | null
): {
  burn: number | null;
  status: "burn" | "not_applicable" | "unknown";
  explanation: string;
} {
  if (ocf == null || !Number.isFinite(ocf)) {
    return {
      burn: null,
      status: "unknown",
      explanation:
        "Operating cash flow is unavailable — burn and runway cannot be estimated.",
    };
  }
  if (ocf >= 0) {
    return {
      burn: null,
      status: "not_applicable",
      explanation:
        "Operating cash flow is non-negative — burn-based runway does not apply.",
    };
  }
  return {
    burn: Math.abs(ocf),
    status: "burn",
    explanation: "Estimated burn from quarterly operating cash outflow.",
  };
}

/**
 * Runway = cash / quarterly burn, only when both are finite and burn > 0.
 * Caps display sanity at 40 quarters; below 4 → short.
 */
export function estimateRunwayQuarters(
  cash: number | null,
  burn: number | null
): {
  quarters: number | null;
  status: CapitalLiquidityBlock["runwayStatus"];
  explanation: string;
} {
  if (cash == null || !Number.isFinite(cash) || cash < 0) {
    return {
      quarters: null,
      status: "unknown",
      explanation: "Cash is unavailable — runway unknown.",
    };
  }
  if (burn == null || !Number.isFinite(burn) || burn <= 0) {
    return {
      quarters: null,
      status: "unknown",
      explanation:
        "Burn is unavailable, irregular, or not applicable — runway unknown.",
    };
  }
  const q = cash / burn;
  if (!Number.isFinite(q) || q < 0) {
    return {
      quarters: null,
      status: "unknown",
      explanation: "Runway could not be computed from cash and burn.",
    };
  }
  const rounded = Math.round(q * 10) / 10;
  if (rounded < 4) {
    return {
      quarters: Math.min(rounded, 40),
      status: "short",
      explanation: `Estimated runway ~${Math.min(rounded, 40)} quarters from cash ÷ quarterly operating burn.`,
    };
  }
  return {
    quarters: Math.min(rounded, 40),
    status: "adequate",
    explanation: `Estimated runway ~${Math.min(rounded, 40)} quarters from cash ÷ quarterly operating burn.`,
  };
}

export function buildLiquidityBlock(
  observations: LiquidityObservation[]
): CapitalLiquidityBlock {
  const cashRow = pickLatest(observations, "cash", false);
  const ocfRow = pickLatest(observations, "operating_cash_flow", true);
  const cash = cashRow?.value ?? null;

  // Refuse FY / YTD OCF as quarterly burn — never invent a short runway.
  let ocf: number | null = null;
  let burnEst = estimateOperatingBurn(null);
  if (ocfRow && knownNumber(ocfRow.value)) {
    if (!isQuarterLengthObservation(ocfRow)) {
      burnEst = {
        burn: null,
        status: "unknown",
        explanation:
          "Operating cash flow period is not a defensible quarter (FY/YTD/unknown duration) — burn and runway left unknown.",
      };
      ocf = ocfRow.value;
    } else {
      ocf = ocfRow.value;
      burnEst = estimateOperatingBurn(ocf);
    }
  }

  const runway =
    burnEst.status === "burn"
      ? estimateRunwayQuarters(cash, burnEst.burn)
      : burnEst.status === "not_applicable"
        ? {
            quarters: null as number | null,
            status: "not_applicable" as const,
            explanation: burnEst.explanation,
          }
        : {
            quarters: null as number | null,
            status: "unknown" as const,
            explanation: burnEst.explanation,
          };

  return {
    cash,
    cashAsOf: cashRow?.periodEnd?.toISOString() ?? null,
    cashSourceUrl: cashRow?.sourceUrl ?? null,
    operatingCashFlow: ocf,
    ocfAsOf: ocfRow?.periodEnd?.toISOString() ?? null,
    estimatedBurn: burnEst.burn,
    runwayQuarters: runway.quarters,
    runwayStatus: runway.status,
    runwayExplanation: runway.explanation,
  };
}
