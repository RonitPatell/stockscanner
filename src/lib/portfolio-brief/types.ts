/**
 * Personalized Portfolio Brief — types.
 * Answers: "What happened across my companies that deserves attention?"
 * Review priority only — not buy/sell advice. No live quotes required.
 */

export const PORTFOLIO_BRIEF_VERSION = "1.1.0";

export type PortfolioBriefItem = {
  id: string;
  symbol: string;
  title: string;
  summary: string | null;
  category: string;
  eventType: string;
  significanceLevel: string | null;
  occurredAt: string;
  sourceUrl: string | null;
};

export type PortfolioBriefThesisChange = {
  thesisId: string;
  symbol: string;
  conditionId: string;
  conditionLabel: string;
  polarity: string;
  fromState: string | null;
  toState: string;
  /** True when transition is FAIL or invalidate_if → FAIL/WARN */
  isConflict: boolean;
  evaluatedAt: string | null;
  explanation: string | null;
};

export type PortfolioBriefUpcomingItem = {
  symbol: string;
  label: string;
  date: string;
  source: "earnings_calendar" | "company_event";
  sourceUrl: string | null;
};

export type PortfolioBriefSections = {
  needsReview: PortfolioBriefItem[];
  thesisChanges: PortfolioBriefThesisChange[];
  financial: PortfolioBriefItem[];
  capital: PortfolioBriefItem[];
  insiders: PortfolioBriefItem[];
  ownership: PortfolioBriefItem[];
  upcoming: PortfolioBriefUpcomingItem[];
  quietCompanies: string[];
};

export type PortfolioBriefMeta = {
  version: string;
  generatedAt: string;
  since: string;
  until: string;
  monitoredCount: number;
  emptyPortfolio: boolean;
  /** True when Finnhub/calendar contributed upcoming rows */
  upcomingFromCalendar: boolean;
  windowDays: number;
};

export type PortfolioBriefDto = {
  sections: PortfolioBriefSections;
  meta: PortfolioBriefMeta;
  /** One-line status for empty / quiet mornings */
  headline: string;
};

export type BriefEventInput = {
  id: string;
  symbol: string;
  title: string;
  summary: string | null;
  category: string;
  eventType: string;
  significanceLevel: string | null;
  occurredAt: string;
  sourceUrl: string | null;
};

export type BriefThesisEvalCondition = {
  conditionId: string;
  label: string;
  polarity: string;
  state: string | null;
  mode: "automated" | "manual";
  explanation?: string | null;
};

export type BriefThesisSnapshot = {
  thesisId: string;
  symbol: string;
  evaluatedAt: string | null;
  conditions: BriefThesisEvalCondition[];
};
