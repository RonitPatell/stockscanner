/**
 * Watchtower feed DTOs — portfolio-scoped material-change feed.
 * Severity / significance = review priority, never buy/sell advice.
 */

import type {
  SignificanceEvidenceItem,
  SignificanceLevel,
  SignificanceReasonCode,
} from "../company-events/significance.ts";

export type WatchtowerSignificanceDto = {
  level: SignificanceLevel | null;
  reasonCodes: SignificanceReasonCode[];
  evidence: SignificanceEvidenceItem[];
  engineVersion: string | null;
  /** Reserved for user thesis overlay — always null until thesis engine wires it. */
  thesisRelevance: null;
};

export type WatchtowerSourceDto = {
  type: string;
  id: string | null;
  url: string | null;
};

export type WatchtowerReadStateDto = {
  isRead: boolean;
  readAt: string | null;
  isDismissed: boolean;
  dismissedAt: string | null;
};

export type WatchtowerEventDto = {
  id: string;
  symbol: string;
  companyName: string | null;
  category: string;
  eventType: string;
  /** Legacy CompanyEvent.severity column (critical|material|notable|info|unknown). */
  severity: string;
  title: string;
  summary: string | null;
  occurredAt: string;
  detectedAt: string;
  significance: WatchtowerSignificanceDto;
  source: WatchtowerSourceDto;
  /** Bounded evidence blob from CompanyEvent.evidenceJson (no secrets). */
  evidence: Record<string, unknown>;
  /** Explicit placeholder for later thesis overlay (mirrors significance.thesisRelevance). */
  thesisRelevance: null;
  readState: WatchtowerReadStateDto;
};

export type WatchtowerFeedMeta = {
  monitoredSymbolCount: number;
  monitoredSymbols: string[];
  limit: number;
  includeDismissed: boolean;
  unreadOnly: boolean;
};

export type WatchtowerFeedResult = {
  items: WatchtowerEventDto[];
  nextCursor: string | null;
  meta: WatchtowerFeedMeta;
};
