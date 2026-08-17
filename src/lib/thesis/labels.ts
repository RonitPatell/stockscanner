/**
 * Human-readable Thesis labels — never show raw DB enums in the UI.
 */

import type {
  CapitalRiskStatusLevel,
  GrowthPeriod,
  ThesisConditionEvalState,
  ThesisConditionType,
  ThesisMetricKey,
} from "./types.ts";

export const THESIS_METRIC_LABELS: Record<ThesisMetricKey, string> = {
  revenue: "Revenue",
  gross_margin: "Gross margin",
  operating_margin: "Operating margin",
  net_margin: "Net margin",
  net_income: "Net income",
  eps: "EPS (diluted)",
  cash: "Cash & equivalents",
  cash_runway_quarters: "Cash runway",
  shares_outstanding: "Shares outstanding",
  free_cash_flow: "Free cash flow",
};

/** Curated events for the condition builder (investor-plain). */
export const THESIS_EVENT_OPTIONS: { value: string; label: string }[] = [
  { value: "atm_program", label: "New ATM financing" },
  { value: "sec_s3", label: "New S-3 registration" },
  { value: "shelf_registration", label: "Shelf registration" },
  { value: "sec_s1", label: "New S-1 registration" },
  { value: "registered_direct", label: "Registered direct offering" },
  { value: "convertible_instrument", label: "Convertible instrument" },
  { value: "warrant_issuance", label: "Warrant issuance" },
  { value: "reverse_split", label: "Reverse split" },
  { value: "share_issuance", label: "Share issuance" },
  { value: "management_change", label: "Management change" },
  { value: "ceo_change", label: "CEO change" },
  { value: "cfo_change", label: "CFO change" },
  { value: "auditor_change", label: "Auditor change" },
  { value: "guidance_lowered", label: "Guidance lowered" },
  { value: "non_reliance_restatement", label: "Financial restatement" },
];

export const CAPITAL_RISK_LABELS: Record<CapitalRiskStatusLevel, string> = {
  unknown: "Unknown",
  low: "Low",
  moderate: "Moderate",
  elevated: "Elevated",
};

export const GROWTH_PERIOD_LABELS: Record<GrowthPeriod, string> = {
  yoy: "Year over year",
  qoq: "Quarter over quarter",
};

export type ThesisBuilderKind =
  | "metric_level"
  | "metric_growth"
  | "share_growth"
  | "event"
  | "capital_risk"
  | "cash_runway"
  | "manual";

export const THESIS_BUILDER_KIND_OPTIONS: {
  value: ThesisBuilderKind;
  label: string;
  hint: string;
}[] = [
  {
    value: "metric_growth",
    label: "Metric growth",
    hint: "e.g. revenue growth stays above 25% year over year",
  },
  {
    value: "metric_level",
    label: "Metric level",
    hint: "e.g. gross margin stays above 30%",
  },
  {
    value: "share_growth",
    label: "Share count growth",
    hint: "Share count growth stays below a limit",
  },
  {
    value: "event",
    label: "Event",
    hint: "e.g. new ATM financing does not occur",
  },
  {
    value: "capital_risk",
    label: "Capital risk",
    hint: "Capital risk never rises above a ceiling",
  },
  {
    value: "cash_runway",
    label: "Cash runway",
    hint: "Cash runway stays above N quarters",
  },
  {
    value: "manual",
    label: "Manual note",
    hint: "Something TrustTicker cannot verify automatically",
  },
];

export type UserFacingConditionStatus =
  | "intact"
  | "needs_review"
  | "unknown"
  | "manual";

export function evalStateToUserStatus(
  state: ThesisConditionEvalState | null | undefined,
  mode: "automated" | "manual"
): UserFacingConditionStatus {
  if (mode === "manual") return "manual";
  if (state === "PASS") return "intact";
  if (state === "WARN" || state === "FAIL") return "needs_review";
  return "unknown";
}

export function userStatusLabel(status: UserFacingConditionStatus): string {
  switch (status) {
    case "intact":
      return "Intact";
    case "needs_review":
      return "Needs review";
    case "unknown":
      return "Unknown";
    case "manual":
      return "Manual";
  }
}

export function formatHealthSummaryLine(summary: {
  passing: number;
  warning: number;
  failed: number;
  unknown: number;
  manual?: number;
} | null): string {
  if (!summary) return "Not checked yet";
  const intact = summary.passing;
  const needsReview = summary.warning + summary.failed;
  const unknown = summary.unknown;
  const parts = [
    `${intact} intact`,
    `${needsReview} needs review`,
    `${unknown} unknown`,
  ];
  return parts.join(" · ");
}

export function eventLabel(eventType: string): string {
  return (
    THESIS_EVENT_OPTIONS.find((o) => o.value === eventType)?.label ?? eventType
  );
}

export function metricLabel(key: string): string {
  return (
    THESIS_METRIC_LABELS[key as ThesisMetricKey] ??
    key.replace(/_/g, " ")
  );
}

/** Build a plain-English condition sentence for cards. */
export function describeCondition(opts: {
  conditionType: ThesisConditionType | string;
  params: Record<string, unknown>;
  label?: string;
}): string {
  const t = opts.conditionType;
  const p = opts.params;

  if (t === "CUSTOM_MANUAL") {
    const text = typeof p.text === "string" ? p.text : opts.label ?? "";
    return text || "Manual condition";
  }
  if (t === "METRIC_ABOVE") {
    return `${metricLabel(String(p.metricKey))} stays above ${p.threshold}`;
  }
  if (t === "METRIC_BELOW") {
    return `${metricLabel(String(p.metricKey))} stays below ${p.threshold}`;
  }
  if (t === "METRIC_GROWTH_ABOVE") {
    const period = GROWTH_PERIOD_LABELS[(p.period as GrowthPeriod) || "yoy"];
    return `${metricLabel(String(p.metricKey))} growth stays above ${p.thresholdPercent}% (${period.toLowerCase()})`;
  }
  if (t === "METRIC_GROWTH_BELOW") {
    const period = GROWTH_PERIOD_LABELS[(p.period as GrowthPeriod) || "yoy"];
    return `${metricLabel(String(p.metricKey))} growth stays below ${p.thresholdPercent}% (${period.toLowerCase()})`;
  }
  if (t === "SHARE_COUNT_CHANGE_BELOW") {
    const period = GROWTH_PERIOD_LABELS[(p.period as GrowthPeriod) || "yoy"];
    return `Share count growth stays below ${p.thresholdPercent}% (${period.toLowerCase()})`;
  }
  if (t === "NO_EVENT_TYPE") {
    return `${eventLabel(String(p.eventType))} does not occur`;
  }
  if (t === "EVENT_TYPE_OCCURRED") {
    return `${eventLabel(String(p.eventType))} does occur`;
  }
  if (t === "CAPITAL_RISK_NOT_ABOVE") {
    const max = CAPITAL_RISK_LABELS[p.maxStatus as CapitalRiskStatusLevel] ?? String(p.maxStatus);
    return `Capital risk stays at or below ${max}`;
  }
  if (t === "CASH_RUNWAY_ABOVE") {
    return `Cash runway stays above ${p.quarters} quarters`;
  }
  return opts.label || "Condition";
}

export function formatConditionValueDisplay(opts: {
  conditionType: string;
  actualValue: number | null | undefined;
  evidenceLabel?: string | null;
}): string {
  if (opts.actualValue != null && Number.isFinite(opts.actualValue)) {
    const t = opts.conditionType;
    if (
      t.includes("GROWTH") ||
      t === "SHARE_COUNT_CHANGE_BELOW" ||
      t === "METRIC_GROWTH_ABOVE" ||
      t === "METRIC_GROWTH_BELOW"
    ) {
      return `${opts.actualValue.toFixed(1)}%`;
    }
    if (t.includes("MARGIN") || opts.conditionType.includes("margin")) {
      return `${opts.actualValue.toFixed(1)}%`;
    }
    if (Math.abs(opts.actualValue) >= 1e6) {
      return opts.actualValue.toLocaleString("en-US", {
        maximumFractionDigits: 0,
      });
    }
    return String(
      Number.isInteger(opts.actualValue)
        ? opts.actualValue
        : Number(opts.actualValue.toFixed(2))
    );
  }
  return opts.evidenceLabel?.trim() || "—";
}
