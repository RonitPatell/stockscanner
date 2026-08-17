/**
 * Period matching + position change classification for 13F snapshots.
 */

import type {
  InstitutionalChangeKind,
  PriorHolding,
} from "./types.ts";

/** Normalize CUSIP for matching (uppercase, strip spaces). */
export function normalizeCusip(cusip: string | null | undefined): string | null {
  if (!cusip) return null;
  const c = cusip.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return c.length >= 6 ? c : null;
}

export function holdingMatchKey(opts: {
  cusip?: string | null;
  symbol?: string | null;
  issuerName?: string | null;
}): string {
  const cusip = normalizeCusip(opts.cusip);
  if (cusip) return `cusip:${cusip}`;
  const sym = opts.symbol?.trim().toUpperCase();
  if (sym) return `sym:${sym}`;
  const name = (opts.issuerName ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return name ? `name:${name}` : "unknown";
}

/**
 * Pick the prior comparable report date for a filer.
 * Comparable = latest reportDate strictly before current (same filer).
 * Does not invent calendar quarters if the filer skipped a period.
 */
export function findPriorReportDate(
  reportDates: Date[],
  current: Date
): Date | null {
  const cur = current.getTime();
  let best: Date | null = null;
  for (const d of reportDates) {
    const t = d.getTime();
    if (!Number.isFinite(t) || t >= cur) continue;
    if (!best || t > best.getTime()) best = d;
  }
  return best;
}

/**
 * Whether two report dates are a reasonable consecutive pair for disclosure.
 * Allows ~60–120 day gaps typical of quarterly 13F; flags odd gaps as still
 * comparable but tagged (caller may note lag).
 */
export function periodGapDays(prior: Date, current: Date): number {
  return Math.round((current.getTime() - prior.getTime()) / 86_400_000);
}

export function isTypicalQuarterlyGap(prior: Date, current: Date): boolean {
  const days = periodGapDays(prior, current);
  return days >= 60 && days <= 120;
}

/**
 * Classify share change between prior and current positions.
 * Exited = present in prior, absent in current (caller supplies shares=0).
 */
export function classifyPositionChange(opts: {
  currentShares: number | null;
  priorShares: number | null;
  /** True when this row is a synthetic exit (not in current filing). */
  isExit?: boolean;
}): {
  changeKind: InstitutionalChangeKind;
  sharesChange: number | null;
} {
  if (opts.isExit) {
    const prior = opts.priorShares;
    return {
      changeKind: "exited",
      sharesChange:
        prior != null && Number.isFinite(prior) ? -prior : null,
    };
  }

  const cur = opts.currentShares;
  const prior = opts.priorShares;

  if (cur == null || !Number.isFinite(cur)) {
    return { changeKind: "unknown", sharesChange: null };
  }

  if (prior == null || !Number.isFinite(prior)) {
    return { changeKind: "new", sharesChange: cur };
  }

  const delta = cur - prior;
  if (Math.abs(delta) < 0.5) {
    return { changeKind: "unchanged", sharesChange: 0 };
  }
  if (delta > 0) return { changeKind: "increased", sharesChange: delta };
  return { changeKind: "reduced", sharesChange: delta };
}

export function classifyAgainstPrior(opts: {
  currentShares: number | null;
  currentValue: number | null;
  prior: PriorHolding | null;
}): {
  changeKind: InstitutionalChangeKind;
  priorShares: number | null;
  priorValueUsd: number | null;
  priorReportDate: Date | null;
  priorAccession: string | null;
  sharesChange: number | null;
  valueChange: number | null;
} {
  const prior = opts.prior;
  const { changeKind, sharesChange } = classifyPositionChange({
    currentShares: opts.currentShares,
    priorShares: prior?.shares ?? null,
  });

  let valueChange: number | null = null;
  if (
    opts.currentValue != null &&
    Number.isFinite(opts.currentValue) &&
    prior?.valueUsd != null &&
    Number.isFinite(prior.valueUsd)
  ) {
    valueChange = opts.currentValue - prior.valueUsd;
  } else if (changeKind === "new" && opts.currentValue != null) {
    valueChange = opts.currentValue;
  }

  return {
    changeKind,
    priorShares: prior?.shares ?? null,
    priorValueUsd: prior?.valueUsd ?? null,
    priorReportDate: prior?.reportDate ?? null,
    priorAccession: prior?.accessionNumber ?? null,
    sharesChange,
    valueChange,
  };
}

export function changeKindLabel(kind: InstitutionalChangeKind): string {
  switch (kind) {
    case "new":
      return "New position";
    case "increased":
      return "Increased";
    case "reduced":
      return "Reduced";
    case "exited":
      return "Exited";
    case "unchanged":
      return "Unchanged";
    default:
      return "Unknown";
  }
}
