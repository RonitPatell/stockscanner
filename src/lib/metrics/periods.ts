/**
 * Period compatibility for YoY / QoQ — never silently mix incompatible windows.
 */

import type { SecCompanyfactsUnitPoint } from "./types.ts";

const MS_DAY = 86_400_000;

export function parseIsoDate(raw: string | undefined | null): Date | null {
  if (!raw || !raw.trim()) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function durationDays(
  start: Date | null,
  end: Date | null
): number | null {
  if (!start || !end) return null;
  const days = Math.round((end.getTime() - start.getTime()) / MS_DAY);
  return days > 0 ? days : null;
}

export function normalizeFiscalPeriod(
  fp: string | undefined | null
): string | null {
  if (!fp) return null;
  const u = fp.trim().toUpperCase();
  if (u === "FY" || u === "Q1" || u === "Q2" || u === "Q3" || u === "Q4") {
    return u;
  }
  // CY2024Q2 style frames sometimes appear in fp-less rows — not fiscalPeriod.
  return null;
}

export function periodLabelFromParts(opts: {
  fiscalYear: number | null;
  fiscalPeriod: string | null;
  periodEnd: Date | null;
}): string | null {
  if (opts.fiscalYear && opts.fiscalPeriod) {
    return `${opts.fiscalYear}-${opts.fiscalPeriod}`;
  }
  if (opts.periodEnd) {
    return opts.periodEnd.toISOString().slice(0, 10);
  }
  return null;
}

/** Quarterly-ish duration: ~70–110 days. Annual-ish: ~340–400 days. */
export function classifyDurationBucket(
  days: number | null
): "quarter" | "annual" | "other" | "unknown" {
  if (days == null) return "unknown";
  if (days >= 70 && days <= 110) return "quarter";
  if (days >= 340 && days <= 400) return "annual";
  return "other";
}

export function formPreferenceScore(form: string | undefined | null): number {
  const f = (form ?? "").toUpperCase();
  if (f === "10-K" || f === "10-K/A") return 3;
  if (f === "10-Q" || f === "10-Q/A") return 3;
  if (f.startsWith("10-")) return 2;
  if (f === "8-K" || f === "8-K/A") return 1;
  return 0;
}

/**
 * Two duration facts are comparable for YoY when:
 * - same fiscalPeriod (Q2 vs Q2, FY vs FY)
 * - duration days within 15% of each other
 * - not mixing instant with duration (caller ensures same kind)
 */
export function durationsComparableForYoy(a: {
  fiscalPeriod: string | null;
  days: number | null;
}, b: {
  fiscalPeriod: string | null;
  days: number | null;
}): { ok: boolean; reason: string | null } {
  if (a.fiscalPeriod && b.fiscalPeriod && a.fiscalPeriod !== b.fiscalPeriod) {
    return {
      ok: false,
      reason: `Fiscal period mismatch (${a.fiscalPeriod} vs ${b.fiscalPeriod})`,
    };
  }
  return durationLengthsComparable(a.days, b.days);
}

/** Length-only check (for QoQ where fiscal periods differ by design). */
export function durationLengthsComparable(
  aDays: number | null,
  bDays: number | null
): { ok: boolean; reason: string | null } {
  const ba = classifyDurationBucket(aDays);
  const bb = classifyDurationBucket(bDays);
  if (ba === "unknown" || bb === "unknown") {
    return { ok: false, reason: "Unknown duration — cannot compare" };
  }
  if (ba === "other" || bb === "other") {
    return { ok: false, reason: "Non-standard period length" };
  }
  if (ba !== bb) {
    return {
      ok: false,
      reason: `Duration bucket mismatch (${ba} vs ${bb})`,
    };
  }
  if (aDays != null && bDays != null) {
    const ratio =
      Math.max(aDays, bDays) / Math.max(1, Math.min(aDays, bDays));
    if (ratio > 1.15) {
      return {
        ok: false,
        reason: "Period lengths differ by more than 15%",
      };
    }
  }
  return { ok: true, reason: null };
}

export function fiscalPeriodsConsecutive(
  earlier: { fiscalYear: number | null; fiscalPeriod: string | null },
  later: { fiscalYear: number | null; fiscalPeriod: string | null }
): boolean {
  if (
    !earlier.fiscalYear ||
    !later.fiscalYear ||
    !earlier.fiscalPeriod ||
    !later.fiscalPeriod
  ) {
    return false;
  }
  const order = ["Q1", "Q2", "Q3", "Q4"] as const;
  const ei = order.indexOf(earlier.fiscalPeriod as (typeof order)[number]);
  const li = order.indexOf(later.fiscalPeriod as (typeof order)[number]);
  if (ei < 0 || li < 0) return false;
  if (earlier.fiscalYear === later.fiscalYear && li === ei + 1) return true;
  if (
    later.fiscalYear === earlier.fiscalYear + 1 &&
    earlier.fiscalPeriod === "Q4" &&
    later.fiscalPeriod === "Q1"
  ) {
    return true;
  }
  return false;
}

export function pointMeta(p: SecCompanyfactsUnitPoint): {
  periodStart: Date | null;
  periodEnd: Date | null;
  days: number | null;
  fiscalYear: number | null;
  fiscalPeriod: string | null;
  filedAt: Date | null;
  accession: string | null;
  form: string | null;
} {
  const periodStart = parseIsoDate(p.start ?? null);
  const periodEnd = parseIsoDate(p.end);
  return {
    periodStart,
    periodEnd,
    days: durationDays(periodStart, periodEnd),
    fiscalYear: typeof p.fy === "number" ? p.fy : null,
    fiscalPeriod: normalizeFiscalPeriod(p.fp ?? null),
    filedAt: parseIsoDate(p.filed ?? null),
    accession: p.accn?.trim() || null,
    form: p.form?.trim() || null,
  };
}
