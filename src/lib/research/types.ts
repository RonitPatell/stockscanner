/**
 * Research workspace DTOs — factual summaries for Overview.
 * Never includes private thesis notes / premises.
 */

export const RESEARCH_OVERVIEW_VERSION = "1.0.0";

export type ResearchAccessMode = "entitled" | "public";

export type ResearchOverviewEvent = {
  id: string;
  title: string;
  when: string;
  whenLabel: string;
  category: string;
  significance: string | null;
};

export type ResearchOverviewDto = {
  symbol: string;
  identity: {
    edgarSearchUrl: string;
    capitalRiskActive: boolean;
    capitalRiskHint: string | null;
  };
  /** Present only for entitled session users */
  monitoring: {
    inPortfolio: boolean;
    monitoredSince: string | null;
    label: string | null;
  } | null;
  latestEvents: ResearchOverviewEvent[];
  /** Health label only — never thesis note/premise text */
  thesis: {
    healthStatus: string;
    summaryLine: string | null;
    hasThesis: boolean;
  } | null;
  financialDelta: {
    metricLabel: string;
    changeLabel: string;
    emphasis: string;
    periodLabel: string | null;
  } | null;
  capitalRisk: {
    status: string;
    summary: string | null;
  } | null;
  latestInsider: {
    summary: string;
    filedAt: string;
    classification: string | null;
  } | null;
  latestOwnership: {
    summary: string;
    filedAt: string;
    formType: string | null;
  } | null;
  latestFiling: {
    title: string;
    formHint: string | null;
    when: string | null;
    sourceUrl: string | null;
  } | null;
  meta: {
    version: string;
    accessMode: ResearchAccessMode;
    evaluatedAt: string;
  };
};
