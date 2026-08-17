/**
 * Content-addressed fingerprint for MetricObservation dedupe.
 */

import type { FinancialMetricKey } from "./types.ts";

export function metricObservationFingerprint(parts: {
  symbol: string;
  metricKey: FinancialMetricKey | string;
  periodEnd: string | Date | null;
  fiscalYear?: number | null;
  fiscalPeriod?: string | null;
  accession?: string | null;
  secConcept?: string | null;
  sourceType?: string | null;
}): string {
  const end =
    parts.periodEnd instanceof Date
      ? parts.periodEnd.toISOString().slice(0, 10)
      : parts.periodEnd
        ? String(parts.periodEnd).slice(0, 10)
        : "noend";
  return [
    parts.symbol.trim().toUpperCase(),
    parts.metricKey,
    end,
    parts.fiscalYear ?? "nofy",
    (parts.fiscalPeriod ?? "nofp").toUpperCase(),
    (parts.accession ?? "noaccn").toUpperCase(),
    parts.secConcept ?? "noconcept",
    parts.sourceType ?? "sec_companyfacts",
  ].join("|");
}
