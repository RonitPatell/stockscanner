import {
  RELIABILITY_DISCLAIMER,
  RELIABILITY_VERSION,
  STATUS_PAGE_LEGAL_PLACEHOLDER,
} from "./version.ts";
import { evaluateAllIndicators } from "./indicators.ts";
import { buildIncidentTimeline } from "./incidents.ts";
import { getServiceTargets } from "./targets.ts";
import type {
  IndicatorSample,
  MonthlyReliabilityReport,
  ServiceIncidentRecord,
  ServiceTargets,
  SourceDegradationNotice,
} from "./types.ts";

export function buildMonthlyReliabilityReport(input: {
  month: string; // YYYY-MM
  samples: IndicatorSample[];
  incidents: ServiceIncidentRecord[];
  sourceNotices: SourceDegradationNotice[];
  targets?: ServiceTargets;
}): MonthlyReliabilityReport {
  const targets = input.targets ?? getServiceTargets();
  const indicators = evaluateAllIndicators(input.samples, targets);
  const monthIncidents = buildIncidentTimeline(input.incidents).filter((i) =>
    i.startedAt.startsWith(input.month)
  );

  return {
    month: input.month,
    version: RELIABILITY_VERSION,
    indicators,
    incidents: monthIncidents.map((i) => ({
      id: i.id,
      title: i.title,
      severity: i.severity,
      startedAt: i.startedAt,
      endedAt: i.endedAt,
      announcedMaintenance: i.announcedMaintenance,
    })),
    sourceNotices: input.sourceNotices,
    sampleNotes: [
      "All indicators show sample size (n). Targets are not marked achieved without production verification and adequate samples.",
      "Poor-performing samples are retained in aggregates; we do not hide slow or failed observations.",
      "TrustTicker processing latency is reported separately from upstream-provider latency.",
      RELIABILITY_DISCLAIMER,
    ],
    disclaimer: RELIABILITY_DISCLAIMER,
    legalPlaceholder: STATUS_PAGE_LEGAL_PLACEHOLDER,
  };
}
