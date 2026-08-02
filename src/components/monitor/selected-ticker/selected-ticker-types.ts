/**
 * Selected-ticker intelligence dossier for TrustTicker Monitor.
 * Inspection hierarchy only — never buy/sell, expected return, or success probability.
 */

export type FieldAvailability = "ok" | "estimated" | "stale" | "unavailable";

export interface MonitorAvailNumber {
  value: number | null;
  availability: FieldAvailability;
  note?: string | null;
}

export interface MonitorAvailText {
  value: string | null;
  availability: FieldAvailability;
  note?: string | null;
}

export type MonitorRiskKind =
  | "dilution"
  | "offering"
  | "atm"
  | "warrants"
  | "reverse_split"
  | "halt"
  | "stale_news"
  | "wide_spread"
  | "ambiguous_data"
  | "extended_reaction";

export type MonitorRiskStatus = "active" | "clear" | "unavailable";

export interface MonitorPrimaryRisk {
  kind: MonitorRiskKind;
  label: string;
  status: MonitorRiskStatus;
  detail: string | null;
  evidenceUrl?: string | null;
}

export type MonitorTimelineKind =
  | "catalyst"
  | "momentum_transition"
  | "hod"
  | "lod"
  | "halt"
  | "resumption"
  | "risk_change";

export interface MonitorTimelineEvent {
  id: string;
  atMs: number | null;
  kind: MonitorTimelineKind;
  summary: string;
  /** When true, timestamp itself is unavailable (do not invent). */
  timeUnavailable?: boolean;
}

export interface MonitorSelectedTicker {
  symbol: string;

  identity: {
    ticker: string;
    company: MonitorAvailText;
    price: MonitorAvailNumber;
    sessionChangePct: MonitorAvailNumber;
    momentumRank: MonitorAvailNumber;
    pinned: boolean;
  };

  currentState: {
    momentumState: MonitorAvailText;
    momentumIntensity: MonitorAvailNumber;
    attentionPriority: MonitorAvailNumber;
    /** Directional implication for inspection — not a trade instruction. */
    directionalImplication: MonitorAvailText;
    reactionStage: MonitorAvailText;
    tradeability: MonitorAvailText;
    dataConfidence: MonitorAvailText;
  };

  verifiedCatalyst: {
    present: boolean;
    oneSentenceFact: MonitorAvailText;
    sourceName: MonitorAvailText;
    sourceUrl: string | null;
    publicationTime: MonitorAvailText;
    firstSeenTime: MonitorAvailText;
    confirmationLevel: MonitorAvailText;
    catalystAge: MonitorAvailText;
  };

  marketMovement: {
    /** Never backfilled from current price when missing. */
    priceAtCatalyst: MonitorAvailNumber;
    currentPrice: MonitorAvailNumber;
    moveSinceCatalystPct: MonitorAvailNumber;
    tradesPerSecond: MonitorAvailNumber;
    dollarVolumeVelocity: MonitorAvailNumber;
    relativeVolume: MonitorAvailNumber;
    spreadDollars: MonitorAvailNumber;
    spreadBps: MonitorAvailNumber;
    hodContext: MonitorAvailText;
    lodContext: MonitorAvailText;
    vwapContext: MonitorAvailText;
  };

  primaryRisks: MonitorPrimaryRisk[];

  eventTimeline: MonitorTimelineEvent[];

  evidence: {
    primarySource: MonitorAvailText;
    primarySourceUrl: string | null;
    secFilings: MonitorAvailText[];
    supportingFacts: MonitorAvailText[];
    missingOrUncertain: MonitorAvailText[];
  };

  collapsed: {
    historicalAnalogues: MonitorAvailText;
    personalFeedback: MonitorAvailText;
    autopsy: MonitorAvailText;
    additionalMarketStatistics: MonitorAvailText[];
  };

  actions: {
    tradingViewUrl: string;
    sourceUrl: string | null;
  };

  disclaimer: string;
}

export const MONITOR_SELECTED_TICKER_DISCLAIMER =
  "Informational inspection only — not investment advice. No buy/sell instruction, expected return, or success probability.";

export const MONITOR_PRIMARY_RISK_KINDS: Array<{
  kind: MonitorRiskKind;
  label: string;
}> = [
  { kind: "dilution", label: "Dilution" },
  { kind: "offering", label: "Offering" },
  { kind: "atm", label: "ATM" },
  { kind: "warrants", label: "Warrants" },
  { kind: "reverse_split", label: "Reverse split" },
  { kind: "halt", label: "Halt" },
  { kind: "stale_news", label: "Stale news" },
  { kind: "wide_spread", label: "Wide spread" },
  { kind: "ambiguous_data", label: "Ambiguous data" },
  { kind: "extended_reaction", label: "Extended reaction" },
];

export const MONITOR_INTEL_SECTIONS = [
  "identity",
  "what-happened",
  "what-market-doing",
  "tradeability",
  "what-could-go-wrong",
  "evidence",
  "historical-analogues",
  "capital-risk-timeline",
  "personal-feedback",
  "autopsy",
  "additional-market-statistics",
] as const;

export type MonitorIntelSectionId = (typeof MONITOR_INTEL_SECTIONS)[number];
