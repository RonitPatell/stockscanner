/**
 * Content-addressed fingerprints for EvidenceRecord idempotency.
 */

import type { EvidenceCategory, EvidenceLinkedModel } from "./types.ts";

export function evidenceFingerprint(parts: {
  symbol: string;
  category: EvidenceCategory | string;
  sourceType: string;
  sourceId?: string | null;
  linkedModel?: EvidenceLinkedModel | string | null;
  linkedId?: string | null;
  periodEnd?: Date | string | null;
}): string {
  const sym = parts.symbol.trim().toUpperCase();
  const end =
    parts.periodEnd instanceof Date
      ? parts.periodEnd.toISOString().slice(0, 10)
      : parts.periodEnd
        ? String(parts.periodEnd).slice(0, 10)
        : "noend";
  if (parts.linkedModel && parts.linkedId) {
    return [sym, parts.category, parts.linkedModel, parts.linkedId].join("|");
  }
  return [
    sym,
    parts.category,
    parts.sourceType,
    (parts.sourceId ?? "nosid").toUpperCase(),
    end,
  ].join("|");
}
