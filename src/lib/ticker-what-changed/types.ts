/**
 * Company-level What Changed — types.
 * Review priority only; never buy/sell advice.
 */

import type {
  SignificanceEvidenceItem,
  SignificanceLevel,
  SignificanceReasonCode,
} from "../company-events/significance.ts";

export const COMPANY_WHAT_CHANGED_VERSION = "1.0.0";

export const WHAT_CHANGED_WINDOWS = [
  "since_last_view",
  "7d",
  "30d",
  "quarter",
  "1y",
] as const;

export type WhatChangedWindow = (typeof WHAT_CHANGED_WINDOWS)[number];

export type WhatChangedAccessMode = "public" | "entitled";

export type ThesisRelevanceStatus =
  | "matches_condition"
  | "related_category"
  | "none";

/**
 * Entitled-only. Never include thesis note/premise text.
 * Public responses must set thesisRelevance to null.
 */
export type ThesisRelevanceDto = {
  status: ThesisRelevanceStatus;
  conditionId: string | null;
  conditionLabel: string | null;
  polarity: string | null;
  /** Short factual label — no private thesis prose. */
  summary: string;
};

export type WhatChangedSignificanceDto = {
  level: SignificanceLevel | null;
  reasonCodes: SignificanceReasonCode[];
  evidence: SignificanceEvidenceItem[];
  label: string;
};

export type WhatChangedSourceDto = {
  type: string;
  id: string | null;
  url: string | null;
};

/** One aggregate card answering WHAT / WHEN / CATEGORY / SIGNIFICANCE / … */
export type CompanyWhatChangedCard = {
  id: string;
  /** WHAT HAPPENED */
  whatHappened: string;
  /** WHEN (ISO) */
  when: string;
  whenLabel: string;
  /** CATEGORY */
  category: string;
  eventType: string;
  /** SIGNIFICANCE */
  significance: WhatChangedSignificanceDto;
  /** WHAT CHANGED — factual detail */
  whatChanged: string;
  /** SOURCE */
  source: WhatChangedSourceDto;
  /**
   * THESIS RELEVANCE — null on public / unauthenticated.
   * Never carries private thesis note text.
   */
  thesisRelevance: ThesisRelevanceDto | null;
  /** True when default feed would hide this without Show all */
  isRoutine: boolean;
  domain:
    | "company_event"
    | "financial_delta"
    | "filing_section"
    | "capital"
    | "insider"
    | "ownership";
};

export type CompanyWhatChangedFeedMeta = {
  version: string;
  symbol: string;
  window: WhatChangedWindow;
  since: string | null;
  until: string | null;
  showAllActivity: boolean;
  accessMode: WhatChangedAccessMode;
  /** True when since_last_view had no stored view → fell back */
  usedFallbackWindow: boolean;
  fallbackWindow: WhatChangedWindow | null;
  totalBeforeFilter: number;
  routineHiddenCount: number;
  /** Caps applied for public preview */
  previewCapped: boolean;
  hasThesis: boolean;
};

export type CompanyWhatChangedFeed = {
  cards: CompanyWhatChangedCard[];
  empty: boolean;
  emptyMessage: string;
  meta: CompanyWhatChangedFeedMeta;
};

/** Lightweight thesis condition shape for overlay (no note/premise). */
export type ThesisConditionOverlayInput = {
  id: string;
  conditionType: string;
  label: string;
  polarity: string;
  params: Record<string, unknown>;
};

export type EventRowForWhatChanged = {
  id: string;
  symbol: string;
  category: string;
  eventType: string;
  severity: string;
  title: string;
  summary: string | null;
  occurredAt: Date;
  detectedAt: Date;
  sourceType: string;
  sourceId: string | null;
  sourceUrl: string | null;
  evidenceJson: unknown;
  beforeJson?: unknown;
  afterJson?: unknown;
};
