/**
 * Build EvidenceRecord references from existing MetricObservation rows.
 * Does not copy values — links by id for graph traversal.
 */

import type { EvidenceRecordInput } from "./types.ts";
import { evidenceFingerprint } from "./fingerprint.ts";

export type MetricObservationRef = {
  id: string;
  symbol: string;
  cik: string | null;
  metricKey: string;
  value: number | null;
  unit: string | null;
  periodEnd: Date | null;
  filedAt: Date | null;
  accession: string | null;
  secConcept: string | null;
  sourceType: string;
  sourceUrl: string | null;
};

export function evidenceFromMetricObservation(
  row: MetricObservationRef
): EvidenceRecordInput {
  const availability =
    row.sourceType === "derived"
      ? ("derived" as const)
      : row.value == null
        ? ("unknown" as const)
        : ("reported" as const);
  const fingerprint = evidenceFingerprint({
    symbol: row.symbol,
    category: "sec_xbrl_fact",
    sourceType: row.sourceType,
    linkedModel: "metric_observation",
    linkedId: row.id,
    periodEnd: row.periodEnd,
  });
  return {
    symbol: row.symbol,
    cik: row.cik,
    category: "sec_xbrl_fact",
    sourceType: row.sourceType,
    sourceId: row.accession,
    sourceUrl: row.sourceUrl,
    occurredAt: row.periodEnd,
    reportedAt: row.filedAt,
    periodEnd: row.periodEnd,
    linkedModel: "metric_observation",
    linkedId: row.id,
    availability,
    fingerprint,
    payload: {
      metricKey: row.metricKey,
      secConcept: row.secConcept,
      unit: row.unit,
      hasValue: row.value != null,
    },
  };
}
