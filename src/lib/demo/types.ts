export const DEMO_MODES = [
  "DELAYED_REAL",
  "HISTORICAL_REPLAY",
  "CURATED_CASES",
] as const;

export type DemoMode = (typeof DEMO_MODES)[number];

export interface DemoPriceCheckpoint {
  label: string;
  price: number | null;
  changePercent: number | null;
  at: string | null;
}

export interface DemoGuidedSequence {
  whatHappened: string;
  whyItMattered: string;
  trapRisks: string;
  howItReacted: string;
}

/** Public-safe catalyst evidence record — never includes private user/webhook data. */
export interface PublicDemoRecord {
  id: string;
  mode: DemoMode;
  symbol: string;
  headline: string;
  source: string;
  sourceUrl: string | null;
  catalystType: string | null;
  category: string;
  /** Source publication time (ISO). */
  publishedAt: string;
  /** TrustTicker ingest / createdAt (ISO). */
  ingestedAt: string;
  /** Human label for the original event date. */
  eventDateLabel: string;
  priceAtIngest: number | null;
  changePercentAtIngest: number | null;
  priceCheckpoints: DemoPriceCheckpoint[];
  evidence: string[];
  riskFlags: string[];
  guided: DemoGuidedSequence;
  textRedacted: boolean;
  redistributionPermitted: boolean;
}

export interface PublicDemoPayload {
  mode: DemoMode;
  modeLabel: string;
  delayMinutes: number | null;
  sessionDate: string | null;
  disclaimer: string;
  records: PublicDemoRecord[];
  generatedAt: string;
}

export const DEMO_ANALYTICS_EVENTS = [
  "demo_opened",
  "catalyst_expanded",
  "source_clicked",
  "replay_completed",
  "trial_cta_clicked",
] as const;

export type DemoAnalyticsEvent = (typeof DEMO_ANALYTICS_EVENTS)[number];
