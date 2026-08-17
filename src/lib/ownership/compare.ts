/**
 * Compare 13D/13G extracts to prior filings — no motivation inference.
 */

import {
  MATERIAL_OWNERSHIP_PCT,
  MEANINGFUL_PCT_CHANGE,
  type OwnershipComparison,
  type OwnershipStructuredKind,
  type ParsedBeneficialOwnership,
} from "./types.ts";

export type PriorOwnershipRow = {
  percentOwned: number | null;
  sharesOwned: number | null;
  accessionNumber: string;
  filedAt: Date;
};

/**
 * Classify structured event kind from current extract + prior comparable filing.
 */
export function classifyOwnershipChange(opts: {
  current: ParsedBeneficialOwnership;
  prior: PriorOwnershipRow | null;
}): OwnershipComparison {
  const { current, prior } = opts;
  const pct = current.percentOwned;
  const prevPct = prior?.percentOwned ?? null;

  let percentChange: number | null = null;
  if (
    pct != null &&
    Number.isFinite(pct) &&
    prevPct != null &&
    Number.isFinite(prevPct)
  ) {
    percentChange = pct - prevPct;
  }

  let structuredKind: OwnershipStructuredKind = "none";

  // Only emit structured kinds when current % is known — avoid false events.
  if (pct == null || !Number.isFinite(pct)) {
    return {
      previousPercent: prevPct,
      previousShares: prior?.sharesOwned ?? null,
      previousAccession: prior?.accessionNumber ?? null,
      percentChange,
      structuredKind: "none",
    };
  }

  const isAmend = current.isAmendment;
  const hasPrior = prior != null && prevPct != null && Number.isFinite(prevPct);

  // Exit / material reduction established by amendment (or comparable prior)
  if (hasPrior && percentChange != null && percentChange < 0) {
    const exited =
      pct < 0.05 ||
      (prevPct! >= MATERIAL_OWNERSHIP_PCT && pct < MATERIAL_OWNERSHIP_PCT) ||
      Math.abs(percentChange) >= MEANINGFUL_PCT_CHANGE;
    if (exited && (isAmend || hasPrior)) {
      structuredKind = "exit_reduction";
    }
  }

  // Meaningful ownership % change (amendment or subsequent filing)
  if (
    structuredKind === "none" &&
    hasPrior &&
    percentChange != null &&
    Math.abs(percentChange) >= MEANINGFUL_PCT_CHANGE
  ) {
    structuredKind = "pct_change";
  }

  // New material holder — initial filing (or first observed) at/above 5%
  if (
    structuredKind === "none" &&
    pct >= MATERIAL_OWNERSHIP_PCT &&
    (!isAmend || !hasPrior)
  ) {
    structuredKind = "material_new";
  }

  // Amendment that newly establishes >=5% without prior % (rare but valid)
  if (
    structuredKind === "none" &&
    isAmend &&
    !hasPrior &&
    pct >= MATERIAL_OWNERSHIP_PCT
  ) {
    structuredKind = "material_new";
  }

  return {
    previousPercent: prevPct,
    previousShares: prior?.sharesOwned ?? null,
    previousAccession: prior?.accessionNumber ?? null,
    percentChange,
    structuredKind,
  };
}

export function buildOwnershipSummary(opts: {
  filerName: string;
  percentOwned: number | null;
  sharesOwned: number | null;
  formType: string | null;
  isAmendment: boolean;
  structuredKind: OwnershipStructuredKind;
  previousPercent: number | null;
  percentChange: number | null;
}): string {
  const who = opts.filerName.trim() || "Reporting person";
  const form = opts.formType ?? (opts.isAmendment ? "amendment" : "Schedule 13D/G");

  if (opts.percentOwned == null || !Number.isFinite(opts.percentOwned)) {
    return `${who} filed ${form}. Ownership percentage not reliably extractable from this filing.`;
  }

  const pct = formatPct(opts.percentOwned);
  let base = `Beneficial owner reported ${pct}`;
  if (opts.sharesOwned != null && Number.isFinite(opts.sharesOwned)) {
    base += ` (${formatShares(opts.sharesOwned)} shares)`;
  }
  base += ` — ${who}`;

  if (
    opts.structuredKind === "exit_reduction" &&
    opts.previousPercent != null &&
    opts.percentChange != null
  ) {
    base += `. Reported ownership decreased from ${formatPct(opts.previousPercent)} to ${pct} (${formatDelta(opts.percentChange)}).`;
  } else if (
    opts.structuredKind === "pct_change" &&
    opts.previousPercent != null &&
    opts.percentChange != null
  ) {
    base += `. Reported ownership changed from ${formatPct(opts.previousPercent)} to ${pct} (${formatDelta(opts.percentChange)}).`;
  } else if (opts.structuredKind === "material_new") {
    base += `. New material beneficial ownership filing (${form}).`;
  } else if (opts.isAmendment) {
    base += ` (${form}).`;
  } else {
    base += ` (${form}).`;
  }

  return base;
}

function formatPct(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return `${rounded}%`;
}

function formatDelta(n: number): string {
  const sign = n > 0 ? "+" : "";
  const rounded = Math.round(n * 100) / 100;
  return `${sign}${rounded} pp`;
}

function formatShares(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}
