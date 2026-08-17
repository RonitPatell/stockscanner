/**
 * Deterministic Capital Risk evaluation — reason codes on every level.
 * Copy: "Elevated capital risk" — never "will dilute" / "dilution guaranteed".
 */

import type { CapitalRiskStatusLevel } from "../thesis/types.ts";
import { buildFinancingEvents, type FinancingInstrumentInput } from "./financing.ts";
import {
  buildLiquidityBlock,
  type LiquidityObservation,
} from "./liquidity.ts";
import {
  buildShareStructureBlock,
  type ShareObservation,
} from "./share-structure.ts";
import {
  CAPITAL_RISK_ENGINE_VERSION,
  capitalRiskStatusLabel,
  type CapitalRiskReason,
  type CapitalRiskReasonCode,
  type CapitalRiskReport,
} from "./types.ts";

const ELEVATED_TYPES = new Set([
  "ATM_PROGRAM",
  "REGISTERED_DIRECT",
  "EQUITY_PURCHASE_AGREEMENT",
  "CONVERTIBLE_NOTE",
  "CONVERTIBLE_PREFERRED",
]);

const MODERATE_TYPES = new Set([
  "S3_SHELF",
  "S1_REGISTRATION",
  "PROSPECTUS_424B5",
  "WARRANT",
  "WARRANT_REPRICE",
  "EFFECTIVE_REGISTRATION",
]);

const MS_YEAR = 365.25 * 86_400_000;

export type CapitalRiskEvaluateInput = {
  symbol: string;
  asOf?: Date;
  instruments: Array<
    FinancingInstrumentInput & {
      cik?: string | null;
      conflictNote?: string | null;
      needsManualReview?: boolean;
    }
  >;
  observations: Array<LiquidityObservation & ShareObservation>;
  hasInstrumentConflicts?: boolean;
};

function reason(
  code: CapitalRiskReasonCode,
  label: string,
  detail: string,
  severity: CapitalRiskReason["severity"]
): CapitalRiskReason {
  return { code, label, detail, severity };
}

/**
 * Pure evaluation — unit-test every rule + unknown path here.
 */
export function evaluateCapitalRisk(
  input: CapitalRiskEvaluateInput
): Omit<CapitalRiskReport, "snapshotId"> & { cik: string | null } {
  const asOf = input.asOf ?? new Date();
  const symbol = input.symbol.trim().toUpperCase();
  const instruments = input.instruments;
  const active = instruments.filter((i) => i.status === "active");
  /** Capacity filings with unconfirmed status still matter — do not ignore as silence. */
  const capacityPresent = instruments.filter(
    (i) =>
      i.status === "unknown" &&
      (i.instrumentType === "ATM_PROGRAM" ||
        i.instrumentType === "S3_SHELF" ||
        i.instrumentType === "S1_REGISTRATION" ||
        i.instrumentType === "PROSPECTUS_424B5" ||
        i.instrumentType === "REGISTERED_DIRECT" ||
        i.instrumentType === "EQUITY_PURCHASE_AGREEMENT" ||
        i.instrumentType === "CONVERTIBLE_NOTE" ||
        i.instrumentType === "CONVERTIBLE_PREFERRED")
  );
  const reasons: CapitalRiskReason[] = [];

  const liquidity = buildLiquidityBlock(input.observations);
  const shareStructure = buildShareStructureBlock(input.observations);
  const financingEvents = buildFinancingEvents(instruments);

  // —— Financing instruments ——
  if (instruments.length === 0) {
    reasons.push(
      reason(
        "NO_INSTRUMENT_COVERAGE",
        "No qualifying financing event detected in available sources",
        "No DilutionInstrument rows for this symbol yet — not proof of no dilution.",
        "unknown"
      )
    );
  } else if (active.length === 0 && capacityPresent.length === 0) {
    reasons.push(
      reason(
        "NO_ACTIVE_FINANCING_INSTRUMENTS",
        "No active financing instruments detected",
        "Prior instruments exist but none are marked active in available sources.",
        "low"
      )
    );
  }

  for (const i of capacityPresent) {
    const elevated =
      i.instrumentType === "ATM_PROGRAM" ||
      i.instrumentType === "REGISTERED_DIRECT" ||
      i.instrumentType === "EQUITY_PURCHASE_AGREEMENT" ||
      i.instrumentType === "CONVERTIBLE_NOTE" ||
      i.instrumentType === "CONVERTIBLE_PREFERRED";
    reasons.push(
      reason(
        "FINANCING_CAPACITY_STATUS_UNKNOWN",
        "Financing capacity on file (status unconfirmed)",
        `${i.instrumentType.replace(/_/g, " ")} extracted but activity status is unknown — capacity present in available sources, not confirmed active.`,
        elevated ? "elevated" : "moderate"
      )
    );
  }

  for (const i of active) {
    if (i.instrumentType === "ATM_PROGRAM") {
      reasons.push(
        reason(
          "ACTIVE_ATM",
          "Active ATM program",
          "ATM availability is capacity to sell over time — not a confirmed sale by itself.",
          "elevated"
        )
      );
    } else if (i.instrumentType === "REGISTERED_DIRECT") {
      reasons.push(
        reason(
          "ACTIVE_REGISTERED_DIRECT",
          "Active registered direct",
          "Registered direct capacity/offering on file.",
          "elevated"
        )
      );
    } else if (i.instrumentType === "EQUITY_PURCHASE_AGREEMENT") {
      reasons.push(
        reason(
          "ACTIVE_EQUITY_PURCHASE",
          "Active equity purchase agreement",
          "Equity purchase facility on file.",
          "elevated"
        )
      );
    } else if (
      i.instrumentType === "CONVERTIBLE_NOTE" ||
      i.instrumentType === "CONVERTIBLE_PREFERRED"
    ) {
      reasons.push(
        reason(
          "ACTIVE_CONVERTIBLE",
          "Active convertible instrument",
          `${i.instrumentType.replace(/_/g, " ").toLowerCase()} on file.`,
          "elevated"
        )
      );
    } else if (i.instrumentType === "S3_SHELF") {
      reasons.push(
        reason(
          "ACTIVE_S3_SHELF",
          "Active S-3 shelf",
          "Shelf registration capacity — not a confirmed sale.",
          "moderate"
        )
      );
    } else if (i.instrumentType === "S1_REGISTRATION") {
      reasons.push(
        reason(
          "ACTIVE_S1_REGISTRATION",
          "Active S-1 registration",
          "S-1 registration capacity on file.",
          "moderate"
        )
      );
    } else if (i.instrumentType === "PROSPECTUS_424B5") {
      reasons.push(
        reason(
          "ACTIVE_424B5",
          "Active 424B5 prospectus",
          "424B5 prospectus on file.",
          "moderate"
        )
      );
    } else if (
      i.instrumentType === "WARRANT" ||
      i.instrumentType === "WARRANT_REPRICE"
    ) {
      reasons.push(
        reason(
          "ACTIVE_WARRANT",
          "Active warrants",
          "Warrant instrument on file.",
          "moderate"
        )
      );
    } else if (i.instrumentType === "EFFECTIVE_REGISTRATION") {
      reasons.push(
        reason(
          "ACTIVE_EFFECTIVE_REGISTRATION",
          "Effective registration",
          "Registration marked effective.",
          "moderate"
        )
      );
    }

    if (i.capacityKind === "announced_sale" || i.estimateLabel === "announced_sale") {
      reasons.push(
        reason(
          "ANNOUNCED_SALE_CAPACITY",
          "Announced sale / pricing",
          "Filing language indicates an announced sale — still verify settlement.",
          "elevated"
        )
      );
    }
  }

  // Recent reverse split (any status within 12 months)
  const recentReverse = instruments.find((i) => {
    if (i.instrumentType !== "REVERSE_SPLIT") return false;
    const t = i.filingDate?.getTime() ?? i.createdAt?.getTime() ?? 0;
    return t > 0 && asOf.getTime() - t <= MS_YEAR;
  });
  if (recentReverse) {
    reasons.push(
      reason(
        "RECENT_REVERSE_SPLIT",
        "Recent reverse split",
        "Reverse split detected within the last year.",
        "elevated"
      )
    );
  }

  if (
    input.hasInstrumentConflicts ||
    instruments.some((i) => i.conflictNote || i.needsManualReview)
  ) {
    reasons.push(
      reason(
        "INSTRUMENT_CONFLICT",
        "Instrument conflict or review flag",
        "Conflicting or review-flagged capital instruments on file.",
        "moderate"
      )
    );
  }

  // —— Share structure ——
  if (shareStructure.sharesOutstanding == null) {
    reasons.push(
      reason(
        "SHARE_COUNT_UNKNOWN",
        "Share count unknown",
        shareStructure.explanation,
        "unknown"
      )
    );
  } else if (
    shareStructure.yoyChangePercent != null &&
    shareStructure.yoyChangePercent >= 25
  ) {
    reasons.push(
      reason(
        "SHARE_COUNT_YOY_ELEVATED",
        "Share count up sharply year over year",
        `YoY share-count change ${shareStructure.yoyChangePercent.toFixed(1)}%.`,
        "elevated"
      )
    );
  } else if (
    shareStructure.yoyChangePercent != null &&
    shareStructure.yoyChangePercent >= 10
  ) {
    reasons.push(
      reason(
        "SHARE_COUNT_YOY_MODERATE",
        "Share count up year over year",
        `YoY share-count change ${shareStructure.yoyChangePercent.toFixed(1)}%.`,
        "moderate"
      )
    );
  }

  if (
    shareStructure.multiYearChangePercent != null &&
    shareStructure.multiYearChangePercent >= 50
  ) {
    reasons.push(
      reason(
        "SHARE_COUNT_MULTIYEAR_ELEVATED",
        "Multi-year share-count expansion",
        shareStructure.explanation,
        "elevated"
      )
    );
  }

  // —— Liquidity / runway ——
  if (liquidity.cash == null) {
    reasons.push(
      reason(
        "CASH_UNKNOWN",
        "Cash unknown",
        "No cash & equivalents observation available.",
        "unknown"
      )
    );
  } else {
    reasons.push(
      reason(
        "CASH_OBSERVED",
        "Cash observed",
        `Latest cash observation on file.`,
        "info"
      )
    );
  }

  if (liquidity.runwayStatus === "short" && liquidity.runwayQuarters != null) {
    reasons.push(
      reason(
        "RUNWAY_SHORT",
        "Short estimated runway",
        liquidity.runwayExplanation,
        "moderate"
      )
    );
  } else if (liquidity.runwayStatus === "adequate") {
    reasons.push(
      reason(
        "RUNWAY_ADEQUATE",
        "Adequate estimated runway",
        liquidity.runwayExplanation,
        "info"
      )
    );
  } else if (liquidity.runwayStatus === "not_applicable") {
    reasons.push(
      reason(
        "BURN_NOT_APPLICABLE",
        "Burn-based runway not applicable",
        liquidity.runwayExplanation,
        "info"
      )
    );
  } else {
    reasons.push(
      reason(
        "RUNWAY_UNKNOWN",
        "Runway unknown",
        liquidity.runwayExplanation,
        "unknown"
      )
    );
    if (liquidity.estimatedBurn == null && liquidity.operatingCashFlow == null) {
      reasons.push(
        reason(
          "BURN_UNKNOWN",
          "Burn unknown",
          "Operating cash flow unavailable or not usable for burn.",
          "unknown"
        )
      );
    }
  }

  // Dedupe reason codes (keep first)
  const seen = new Set<string>();
  const deduped: CapitalRiskReason[] = [];
  for (const r of reasons) {
    if (seen.has(r.code)) continue;
    seen.add(r.code);
    deduped.push(r);
  }

  const hasElevated = deduped.some((r) => r.severity === "elevated");
  const hasModerate = deduped.some((r) => r.severity === "moderate");
  const hasLowSignal = deduped.some((r) => r.severity === "low");
  const onlyUnknownOrInfo = deduped.every(
    (r) => r.severity === "unknown" || r.severity === "info"
  );
  const sparse =
    instruments.length === 0 &&
    shareStructure.sharesOutstanding == null &&
    liquidity.cash == null;

  let status: CapitalRiskStatusLevel;
  if (sparse) {
    status = "unknown";
    if (!seen.has("DATA_SPARSE")) {
      deduped.push(
        reason(
          "DATA_SPARSE",
          "Sparse capital data",
          "Insufficient instrument and financial observations to classify exposure.",
          "unknown"
        )
      );
    }
  } else if (hasElevated) {
    status = "elevated";
  } else if (hasModerate) {
    status = "moderate";
  } else if (hasLowSignal || active.length === 0) {
    status = onlyUnknownOrInfo && instruments.length === 0 ? "unknown" : "low";
  } else if (onlyUnknownOrInfo) {
    status = "unknown";
  } else {
    status = "low";
  }

  // Ensure every report has at least one reason code
  if (deduped.length === 0) {
    deduped.push(
      reason(
        "DATA_SPARSE",
        "Sparse capital data",
        "No classifying signals produced.",
        "unknown"
      )
    );
    status = "unknown";
  }

  const statusLabel = capitalRiskStatusLabel(status);
  const summaryParts = deduped
    .filter((r) => r.severity === status || (status === "low" && r.severity === "low"))
    .slice(0, 3)
    .map((r) => r.label);
  const summary =
    summaryParts.length > 0
      ? `${statusLabel}: ${summaryParts.join("; ")}. Shelf/registration capacity is not a confirmed sale.`
      : `${statusLabel}. Facts only — not a prediction of future issuance.`;

  const cik =
    instruments.find((i) => i.cik)?.cik ?? null;

  // Also keep legacy elevated/moderate type scan for instrumentIds
  const instrumentIds = active.map((i) => i.id);

  return {
    symbol,
    version: CAPITAL_RISK_ENGINE_VERSION,
    asOf: asOf.toISOString(),
    status,
    statusLabel,
    summary,
    reasonCodes: deduped.map((r) => r.code),
    reasons: deduped,
    liquidity,
    shareStructure,
    financingEvents,
    instrumentIds,
    cik,
  };
}

/** @deprecated Prefer evaluateCapitalRisk — kept for thesis health tests. */
export function buildCapitalRiskFromInstruments(opts: {
  symbol: string;
  instruments: Array<{
    id: string;
    instrumentType: string;
    status: string;
    potentialDilutionPct: number | null;
    estimateLabel: string;
    formType: string | null;
    cik: string | null;
  }>;
  asOf?: Date;
}): {
  symbol: string;
  status: CapitalRiskStatusLevel;
  summary: string;
  metricsJson: Record<string, unknown>;
  instrumentIds: string[];
  asOf: Date;
  cik: string | null;
} {
  const result = evaluateCapitalRisk({
    symbol: opts.symbol,
    asOf: opts.asOf,
    instruments: opts.instruments.map((i) => ({
      ...i,
      filingDate: null,
      sourceUrl: null,
      accessionNumber: null,
      capacityKind: "other",
      confidence: 0.7,
    })),
    observations: [],
  });
  return {
    symbol: result.symbol,
    status: result.status,
    summary: result.summary,
    metricsJson: {
      reasonCodes: result.reasonCodes,
      activeCount: opts.instruments.filter((i) => i.status === "active").length,
      instrumentTypes: [
        ...new Set(
          opts.instruments
            .filter((i) => i.status === "active")
            .map((i) => i.instrumentType)
        ),
      ],
      engineVersion: CAPITAL_RISK_ENGINE_VERSION,
    },
    instrumentIds: result.instrumentIds,
    asOf: opts.asOf ?? new Date(),
    cik: result.cik,
  };
}

export { ELEVATED_TYPES, MODERATE_TYPES };
