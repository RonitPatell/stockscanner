/**
 * Quarterly Delta — factual period-over-period metric differences.
 * Neutral wording only. UNKNOWN when incomparable or missing.
 */

import type {
  FinancialMetricKey,
  MetricConfidence,
  NormalizedMetricObservation,
} from "./types.ts";
import {
  computeQoqDelta,
  computeYoyDelta,
  findQoqPrior,
  findYoyPrior,
} from "./deltas.ts";
import { durationDays, durationsComparableForYoy, classifyDurationBucket } from "./periods.ts";

export const QUARTERLY_DELTA_VERSION = "1.0.0";

export type ComparisonBasis = "yoy" | "qoq" | "prior_filing";

export type DeltaEmphasis =
  | "material_higher"
  | "material_lower"
  | "higher"
  | "lower"
  | "unchanged"
  | "unavailable";

export type QuarterlyDeltaMetricSpec = {
  key: FinancialMetricKey;
  label: string;
  preferredBasis: ComparisonBasis;
  /** Prefer quarterly rows when selecting "current". */
  preferQuarter: boolean;
};

/** Core metrics for the Quarterly Delta surface. */
export const QUARTERLY_DELTA_SPECS: QuarterlyDeltaMetricSpec[] = [
  {
    key: "revenue",
    label: "Revenue",
    preferredBasis: "yoy",
    preferQuarter: true,
  },
  {
    key: "gross_margin",
    label: "Gross margin",
    preferredBasis: "yoy",
    preferQuarter: true,
  },
  {
    key: "operating_margin",
    label: "Operating margin",
    preferredBasis: "yoy",
    preferQuarter: true,
  },
  {
    key: "operating_cash_flow",
    label: "Operating cash flow",
    preferredBasis: "yoy",
    preferQuarter: true,
  },
  {
    key: "free_cash_flow",
    label: "Free cash flow",
    preferredBasis: "yoy",
    preferQuarter: true,
  },
  {
    key: "cash",
    label: "Cash & equivalents",
    preferredBasis: "qoq",
    preferQuarter: false,
  },
  {
    key: "total_debt",
    label: "Total debt",
    preferredBasis: "qoq",
    preferQuarter: false,
  },
  {
    key: "diluted_shares",
    label: "Diluted shares (WA)",
    preferredBasis: "yoy",
    preferQuarter: true,
  },
  {
    key: "shares_outstanding",
    label: "Shares outstanding",
    preferredBasis: "prior_filing",
    preferQuarter: false,
  },
];

export type QuarterlyDeltaObservationDto = {
  value: number | null;
  periodLabel: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  fiscalYear: number | null;
  fiscalPeriod: string | null;
  filedAt: string | null;
  accession: string | null;
  secConcept: string | null;
  sourceUrl: string | null;
  unit: string | null;
  confidence: MetricConfidence;
};

export type QuarterlyDeltaRow = {
  metricKey: FinancialMetricKey;
  label: string;
  basis: ComparisonBasis | null;
  basisLabel: string;
  current: QuarterlyDeltaObservationDto | null;
  previous: QuarterlyDeltaObservationDto | null;
  absoluteChange: number | null;
  percentChange: number | null;
  bpsChange: number | null;
  comparable: boolean;
  emphasis: DeltaEmphasis;
  /** Neutral status copy for UI. */
  changeLabel: string;
  unavailableReason: string | null;
};

export type QuarterlyDeltaReport = {
  symbol: string;
  version: string;
  asOf: string;
  rows: QuarterlyDeltaRow[];
  /** True when no observations were available at all. */
  empty: boolean;
};

const MATERIAL_PCT = 10;
const MATERIAL_BPS = 100;

function toDto(
  o: NormalizedMetricObservation | null | undefined
): QuarterlyDeltaObservationDto | null {
  if (!o) return null;
  return {
    value: o.value,
    periodLabel: o.periodLabel,
    periodStart: o.periodStart?.toISOString() ?? null,
    periodEnd: o.periodEnd?.toISOString() ?? null,
    fiscalYear: o.fiscalYear,
    fiscalPeriod: o.fiscalPeriod,
    filedAt: o.filedAt?.toISOString() ?? null,
    accession: o.accession,
    secConcept: o.secConcept,
    sourceUrl: o.sourceUrl,
    unit: o.unit,
    confidence: o.confidence,
  };
}

function basisLabel(b: ComparisonBasis): string {
  switch (b) {
    case "yoy":
      return "Year over year";
    case "qoq":
      return "Quarter over quarter";
    case "prior_filing":
      return "Prior filing";
  }
}

/**
 * Collapse amendments / restatements: same metric + fiscal identity
 * keeps the latest filedAt (then latest accession).
 */
export function dedupeAmendments(
  rows: NormalizedMetricObservation[]
): NormalizedMetricObservation[] {
  const byId = new Map<string, NormalizedMetricObservation>();
  for (const row of rows) {
    if (row.value == null) continue;
    const id = [
      row.metricKey,
      row.fiscalYear ?? "",
      row.fiscalPeriod ?? "",
      row.periodEnd?.toISOString().slice(0, 10) ?? "",
      row.periodStart?.toISOString().slice(0, 10) ?? "",
    ].join("|");
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, row);
      continue;
    }
    const prevFiled = prev.filedAt?.getTime() ?? 0;
    const nextFiled = row.filedAt?.getTime() ?? 0;
    if (nextFiled > prevFiled) {
      byId.set(id, row);
      continue;
    }
    if (nextFiled === prevFiled) {
      // Prefer restated / later accession lexicographically as weak tie-break
      if ((row.accession ?? "") > (prev.accession ?? "")) {
        byId.set(id, row);
      }
    }
  }
  return [...byId.values()];
}

function isQuarter(o: NormalizedMetricObservation): boolean {
  return (
    o.fiscalPeriod === "Q1" ||
    o.fiscalPeriod === "Q2" ||
    o.fiscalPeriod === "Q3" ||
    o.fiscalPeriod === "Q4"
  );
}

/** Select the latest "current" observation for a metric. */
export function selectCurrentObservation(
  pool: NormalizedMetricObservation[],
  key: FinancialMetricKey,
  preferQuarter: boolean
): NormalizedMetricObservation | null {
  const candidates = pool.filter(
    (p) =>
      p.metricKey === key &&
      typeof p.value === "number" &&
      Number.isFinite(p.value)
  );
  if (candidates.length === 0) return null;

  const ranked = [...candidates].sort((a, b) => {
    if (preferQuarter) {
      const aq = isQuarter(a) ? 1 : 0;
      const bq = isQuarter(b) ? 1 : 0;
      if (bq !== aq) return bq - aq;
      // Prefer true ~90d windows over YTD/other with the same Q label.
      const ad = classifyDurationBucket(
        durationDays(a.periodStart, a.periodEnd)
      );
      const bd = classifyDurationBucket(
        durationDays(b.periodStart, b.periodEnd)
      );
      const aqLen = ad === "quarter" ? 1 : 0;
      const bqLen = bd === "quarter" ? 1 : 0;
      if (bqLen !== aqLen) return bqLen - aqLen;
    }
    const ae = a.periodEnd?.getTime() ?? 0;
    const be = b.periodEnd?.getTime() ?? 0;
    if (be !== ae) return be - ae;
    const af = a.filedAt?.getTime() ?? 0;
    const bf = b.filedAt?.getTime() ?? 0;
    return bf - af;
  });
  return ranked[0] ?? null;
}

/**
 * Prior filing = previous observation by periodEnd then filedAt,
 * excluding current; must be duration-compatible when both have durations.
 */
export function findPriorFiling(
  current: NormalizedMetricObservation,
  pool: NormalizedMetricObservation[]
): NormalizedMetricObservation | null {
  const candidates = pool
    .filter(
      (p) =>
        p.metricKey === current.metricKey &&
        p.fingerprint !== current.fingerprint &&
        p.value != null
    )
    .sort((a, b) => {
      const ae = a.periodEnd?.getTime() ?? 0;
      const be = b.periodEnd?.getTime() ?? 0;
      if (be !== ae) return be - ae;
      return (b.filedAt?.getTime() ?? 0) - (a.filedAt?.getTime() ?? 0);
    });

  for (const p of candidates) {
    // Must be strictly earlier period (or same period older filing already deduped)
    const ce = current.periodEnd?.getTime() ?? 0;
    const pe = p.periodEnd?.getTime() ?? 0;
    if (pe > ce) continue;
    if (pe === ce && (p.filedAt?.getTime() ?? 0) >= (current.filedAt?.getTime() ?? 0)) {
      continue;
    }
    if (current.periodStart && p.periodStart) {
      const cmp = durationsComparableForYoy(
        {
          fiscalPeriod: current.fiscalPeriod,
          days: durationDays(current.periodStart, current.periodEnd),
        },
        {
          fiscalPeriod: p.fiscalPeriod,
          days: durationDays(p.periodStart, p.periodEnd),
        }
      );
      // For prior_filing on instant metrics, skip duration gate when no start
      if (!cmp.ok && current.fiscalPeriod && p.fiscalPeriod) {
        // allow different fiscal periods for balance-sheet prior filing
        if (
          current.metricKey === "cash" ||
          current.metricKey === "total_debt" ||
          current.metricKey === "shares_outstanding"
        ) {
          return p;
        }
        continue;
      }
      if (!cmp.ok) continue;
    }
    return p;
  }
  return null;
}

function classifyEmphasis(opts: {
  absoluteChange: number | null;
  percentChange: number | null;
  bpsChange: number | null;
  comparable: boolean;
  isMargin: boolean;
}): { emphasis: DeltaEmphasis; changeLabel: string } {
  if (!opts.comparable) {
    return { emphasis: "unavailable", changeLabel: "Unavailable" };
  }
  const abs = opts.absoluteChange;
  if (abs == null) {
    return { emphasis: "unavailable", changeLabel: "Unavailable" };
  }
  if (abs === 0) {
    return { emphasis: "unchanged", changeLabel: "Unchanged" };
  }

  const higher = abs > 0;
  let material = false;
  if (opts.isMargin && opts.bpsChange != null) {
    material = Math.abs(opts.bpsChange) >= MATERIAL_BPS;
  } else if (opts.percentChange != null) {
    material = Math.abs(opts.percentChange) >= MATERIAL_PCT;
  } else {
    material = false;
  }

  if (higher) {
    return {
      emphasis: material ? "material_higher" : "higher",
      changeLabel: material ? "Materially higher" : "Higher",
    };
  }
  return {
    emphasis: material ? "material_lower" : "lower",
    changeLabel: material ? "Materially lower" : "Lower",
  };
}

function resolveComparison(
  current: NormalizedMetricObservation,
  pool: NormalizedMetricObservation[],
  preferred: ComparisonBasis
): {
  basis: ComparisonBasis;
  prior: NormalizedMetricObservation | null;
  absoluteChange: number | null;
  percentChange: number | null;
  bpsChange: number | null;
  comparable: boolean;
  reason: string | null;
} {
  const tryBasis = (basis: ComparisonBasis) => {
    if (basis === "yoy") {
      const d = computeYoyDelta(current, pool);
      return {
        basis,
        prior: d.prior,
        absoluteChange: d.absoluteChange,
        percentChange: d.percentChange,
        bpsChange: d.bpsChange,
        comparable: d.comparable,
        reason: d.reason,
      };
    }
    if (basis === "qoq") {
      const d = computeQoqDelta(current, pool);
      return {
        basis,
        prior: d.prior,
        absoluteChange: d.absoluteChange,
        percentChange: d.percentChange,
        bpsChange: d.bpsChange,
        comparable: d.comparable,
        reason: d.reason,
      };
    }
    const prior = findPriorFiling(current, pool);
    if (!prior || current.value == null || prior.value == null) {
      return {
        basis,
        prior: null,
        absoluteChange: null,
        percentChange: null,
        bpsChange: null,
        comparable: false,
        reason: "No prior filing observation",
      };
    }
    if (prior.value === 0) {
      // Zero denominator — absolute ok, percent UNKNOWN
      const abs = current.value - prior.value;
      const isMargin =
        current.metricKey === "gross_margin" ||
        current.metricKey === "operating_margin";
      return {
        basis,
        prior,
        absoluteChange: abs,
        percentChange: null,
        bpsChange: isMargin ? (current.value - prior.value) * 100 : null,
        comparable: true,
        reason: "Percent change unavailable (prior value is zero)",
      };
    }
    const abs = current.value - prior.value;
    const pct = (abs / Math.abs(prior.value)) * 100;
    const isMargin =
      current.metricKey === "gross_margin" ||
      current.metricKey === "operating_margin";
    return {
      basis,
      prior,
      absoluteChange: abs,
      percentChange: Number.isFinite(pct) ? pct : null,
      bpsChange: isMargin ? abs * 100 : null,
      comparable: true,
      reason: null,
    };
  };

  const primary = tryBasis(preferred);
  if (primary.comparable) return primary;

  // Fallback order
  const fallbacks: ComparisonBasis[] =
    preferred === "yoy"
      ? ["qoq", "prior_filing"]
      : preferred === "qoq"
        ? ["prior_filing", "yoy"]
        : ["qoq", "yoy"];

  for (const b of fallbacks) {
    const next = tryBasis(b);
    if (next.comparable) return next;
  }
  return primary;
}

/**
 * Build a Quarterly Delta report from in-memory observations (tests + SSR).
 */
export function buildQuarterlyDeltaReport(opts: {
  symbol: string;
  observations: NormalizedMetricObservation[];
  now?: Date;
}): QuarterlyDeltaReport {
  const symbol = opts.symbol.trim().toUpperCase();
  const pool = dedupeAmendments(opts.observations);
  const rows: QuarterlyDeltaRow[] = [];

  for (const spec of QUARTERLY_DELTA_SPECS) {
    const current = selectCurrentObservation(
      pool,
      spec.key,
      spec.preferQuarter
    );
    if (!current) {
      rows.push({
        metricKey: spec.key,
        label: spec.label,
        basis: null,
        basisLabel: basisLabel(spec.preferredBasis),
        current: null,
        previous: null,
        absoluteChange: null,
        percentChange: null,
        bpsChange: null,
        comparable: false,
        emphasis: "unavailable",
        changeLabel: "Unavailable",
        unavailableReason: "No observation for this metric",
      });
      continue;
    }

    // Skip unreliable FCF
    if (
      spec.key === "free_cash_flow" &&
      (current.confidence === "low" || current.confidence === "unknown")
    ) {
      rows.push({
        metricKey: spec.key,
        label: spec.label,
        basis: null,
        basisLabel: basisLabel(spec.preferredBasis),
        current: toDto(current),
        previous: null,
        absoluteChange: null,
        percentChange: null,
        bpsChange: null,
        comparable: false,
        emphasis: "unavailable",
        changeLabel: "Unavailable",
        unavailableReason: "Free cash flow not reliable enough to compare",
      });
      continue;
    }

    const cmp = resolveComparison(current, pool, spec.preferredBasis);
    const isMargin =
      spec.key === "gross_margin" || spec.key === "operating_margin";
    const { emphasis, changeLabel } = classifyEmphasis({
      absoluteChange: cmp.absoluteChange,
      percentChange: cmp.percentChange,
      bpsChange: cmp.bpsChange,
      comparable: cmp.comparable,
      isMargin,
    });

    rows.push({
      metricKey: spec.key,
      label: spec.label,
      basis: cmp.comparable ? cmp.basis : null,
      basisLabel: basisLabel(cmp.basis),
      current: toDto(current),
      previous: toDto(cmp.prior),
      absoluteChange: cmp.absoluteChange,
      percentChange: cmp.percentChange,
      bpsChange: cmp.bpsChange,
      comparable: cmp.comparable,
      emphasis,
      changeLabel,
      unavailableReason: cmp.comparable
        ? cmp.reason
        : cmp.reason ?? "No comparable prior period",
    });
  }

  return {
    symbol,
    version: QUARTERLY_DELTA_VERSION,
    asOf: (opts.now ?? new Date()).toISOString(),
    rows,
    empty: pool.length === 0,
  };
}

/** Re-export helpers used by tests for fiscal boundary / amendment cases. */
export { findYoyPrior, findQoqPrior };
