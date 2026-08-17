/**
 * Map CompanyEvent (+ optional supplements) → What Changed cards.
 */

import {
  SIGNIFICANCE_LEVELS,
  type SignificanceEvidenceItem,
  type SignificanceLevel,
  type SignificanceReasonCode,
} from "../company-events/significance.ts";
import { formatEventWhen, significanceDisplay } from "../watchtower/ui.ts";
import { isRoutineActivity } from "./routine.ts";
import type {
  CompanyWhatChangedCard,
  EventRowForWhatChanged,
  ThesisRelevanceDto,
} from "./types.ts";

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return {};
}

export function parseEventSignificance(evidenceJson: unknown): {
  level: SignificanceLevel | null;
  reasonCodes: SignificanceReasonCode[];
  evidence: SignificanceEvidenceItem[];
} {
  const root = asRecord(evidenceJson);
  const sig = asRecord(root.significance);
  const levelRaw = sig.level;
  const level =
    typeof levelRaw === "string" &&
    (SIGNIFICANCE_LEVELS as readonly string[]).includes(levelRaw)
      ? (levelRaw as SignificanceLevel)
      : null;

  const reasonCodes = Array.isArray(sig.reasonCodes)
    ? (sig.reasonCodes.filter((c) => typeof c === "string") as SignificanceReasonCode[])
    : [];

  const evidence: SignificanceEvidenceItem[] = Array.isArray(sig.evidence)
    ? (sig.evidence.filter(
        (e) =>
          e &&
          typeof e === "object" &&
          typeof (e as SignificanceEvidenceItem).code === "string" &&
          typeof (e as SignificanceEvidenceItem).detail === "string"
      ) as SignificanceEvidenceItem[])
    : [];

  return { level, reasonCodes, evidence };
}

function domainFor(category: string, eventType: string): CompanyWhatChangedCard["domain"] {
  if (eventType === "filing_section_change") return "filing_section";
  if (eventType === "capital_risk_level_change" || category === "capital")
    return "capital";
  if (category === "insider") return "insider";
  if (category === "ownership") return "ownership";
  if (category === "financial") return "financial_delta";
  return "company_event";
}

function describeWhatChanged(row: EventRowForWhatChanged): string {
  if (row.summary?.trim()) return row.summary.trim();

  const before = asRecord(row.beforeJson);
  const after = asRecord(row.afterJson);
  const evidence = asRecord(row.evidenceJson);

  const parts: string[] = [];
  if (typeof before.status === "string" && typeof after.status === "string") {
    parts.push(`Status ${before.status} → ${after.status}`);
  }
  if (typeof evidence.sectionTitle === "string") {
    parts.push(`${evidence.sectionTitle} wording changed vs prior filing`);
  }
  if (typeof evidence.changeKind === "string") {
    parts.push(`Ownership change: ${evidence.changeKind}`);
  }
  if (parts.length) return parts.join(". ");
  return "See source for details.";
}

export function mapEventToWhatChangedCard(
  row: EventRowForWhatChanged,
  opts?: {
    now?: number;
    thesisRelevance?: ThesisRelevanceDto | null;
  }
): CompanyWhatChangedCard {
  const sig = parseEventSignificance(row.evidenceJson);
  const level = sig.level;
  const isRoutine = isRoutineActivity({
    eventType: row.eventType,
    significanceLevel: level,
    reasonCodes: sig.reasonCodes,
  });

  return {
    id: row.id,
    whatHappened: row.title,
    when: row.occurredAt.toISOString(),
    whenLabel: formatEventWhen(row.occurredAt.toISOString(), opts?.now),
    category: row.category,
    eventType: row.eventType,
    significance: {
      level,
      reasonCodes: sig.reasonCodes,
      evidence: sig.evidence,
      label: significanceDisplay(level),
    },
    whatChanged: describeWhatChanged(row),
    source: {
      type: row.sourceType,
      id: row.sourceId,
      url: row.sourceUrl,
    },
    thesisRelevance: opts?.thesisRelevance ?? null,
    isRoutine,
    domain: domainFor(row.category, row.eventType),
  };
}

/** Supplemental financial delta card (not a CompanyEvent row). */
export function mapFinancialDeltaCard(opts: {
  symbol: string;
  asOf: string;
  lines: string[];
  sourceUrl?: string | null;
  now?: number;
}): CompanyWhatChangedCard {
  const id = `fin-delta-${opts.symbol}-${opts.asOf.slice(0, 10)}`;
  const whatChanged =
    opts.lines.length > 0
      ? opts.lines.slice(0, 4).join("; ")
      : "Comparable period metric differences available.";
  return {
    id,
    whatHappened: "Financial period deltas updated",
    when: opts.asOf,
    whenLabel: formatEventWhen(opts.asOf, opts.now),
    category: "financial",
    eventType: "financial_metric_delta",
    significance: {
      level: "MEDIUM",
      reasonCodes: ["MATERIAL_MARGIN_OR_RESULTS"],
      evidence: [
        {
          code: "MATERIAL_MARGIN_OR_RESULTS",
          detail: "Material or notable quarterly metric differences",
          source: "evidence_json",
        },
      ],
      label: "Medium",
    },
    whatChanged,
    source: {
      type: "derived",
      id: null,
      url: opts.sourceUrl ?? null,
    },
    thesisRelevance: null,
    isRoutine: false,
    domain: "financial_delta",
  };
}
