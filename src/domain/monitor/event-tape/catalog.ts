import type {
  MonitorTapeEventType,
  TapeIntelSection,
  TapeSourceType,
} from "./types.ts";

export interface TapeEventCatalogEntry {
  label: string;
  /** Base explanation — always user-readable; never a trade instruction. */
  explanation: string;
  sourceType: TapeSourceType;
  intelSection: TapeIntelSection;
}

/**
 * Canonical labels + explanations for every normalized tape event.
 * Language describes inspection context only.
 */
export const TAPE_EVENT_CATALOG: Record<
  MonitorTapeEventType,
  TapeEventCatalogEntry
> = {
  VERIFIED_CATALYST: {
    label: "Verified catalyst",
    explanation:
      "A catalyst fact passed TrustTicker verification checks and is available for inspection.",
    sourceType: "catalyst",
    intelSection: "verified-catalyst",
  },
  CATALYST_CORRECTION: {
    label: "Catalyst correction",
    explanation:
      "A prior catalyst fact was corrected or superseded — re-check source attribution and timestamps.",
    sourceType: "catalyst",
    intelSection: "verified-catalyst",
  },
  MOMENTUM_EMERGING: {
    label: "Momentum emerging",
    explanation:
      "Participation is leaving a quiet baseline. Lifecycle label for inspection order only.",
    sourceType: "momentum",
    intelSection: "current-state",
  },
  MOMENTUM_BUILDING: {
    label: "Momentum building",
    explanation:
      "Activity intensity is rising versus the symbol’s recent baseline — not a trade cue.",
    sourceType: "momentum",
    intelSection: "current-state",
  },
  MOMENTUM_BREAKING: {
    label: "Momentum breaking",
    explanation:
      "Brief-window activity crossed a break threshold used for attention ranking.",
    sourceType: "momentum",
    intelSection: "current-state",
  },
  MOMENTUM_COOLING: {
    label: "Momentum cooling",
    explanation:
      "Intensity is easing after an active phase. Useful when reviewing fade vs continuation context.",
    sourceType: "momentum",
    intelSection: "current-state",
  },
  MOMENTUM_FADING: {
    label: "Momentum fading",
    explanation:
      "Participation is decaying versus the prior active window.",
    sourceType: "momentum",
    intelSection: "current-state",
  },
  MOMENTUM_RECLAIMING: {
    label: "Momentum reclaiming",
    explanation:
      "Activity is recovering after a cool/fade phase — still an inspection label only.",
    sourceType: "momentum",
    intelSection: "current-state",
  },
  HOD_BREAK: {
    label: "Session high break",
    explanation:
      "Last price printed through the session high reference used in market-structure context.",
    sourceType: "market_structure",
    intelSection: "market-movement",
  },
  LOD_BREAK: {
    label: "Session low break",
    explanation:
      "Last price printed through the session low reference used in market-structure context.",
    sourceType: "market_structure",
    intelSection: "market-movement",
  },
  VOLUME_BURST: {
    label: "Volume burst",
    explanation:
      "Dollar or share volume accelerated sharply versus the symbol’s recent baseline.",
    sourceType: "market_structure",
    intelSection: "market-movement",
  },
  TRADE_RATE_BURST: {
    label: "Trade-rate burst",
    explanation:
      "Trades-per-second rose unusually versus the symbol’s recent print rate.",
    sourceType: "market_structure",
    intelSection: "market-movement",
  },
  SPREAD_WIDENING: {
    label: "Spread widening",
    explanation:
      "Quoted spread widened enough to reduce tradeability confidence — inspect liquidity.",
    sourceType: "market_structure",
    intelSection: "market-movement",
  },
  SPREAD_NORMALIZED: {
    label: "Spread normalized",
    explanation:
      "Quoted spread returned toward a tighter band after a widening episode.",
    sourceType: "market_structure",
    intelSection: "market-movement",
  },
  HALTED: {
    label: "Halted",
    explanation:
      "Trading halt detected. Quotes/trades may pause — wait for official resumption context.",
    sourceType: "halt",
    intelSection: "primary-risks",
  },
  NEWS_RELEASED_DURING_HALT: {
    label: "News during halt",
    explanation:
      "A news/catalyst item arrived while the symbol was halted — treat timing carefully.",
    sourceType: "halt",
    intelSection: "verified-catalyst",
  },
  RESUMPTION_SCHEDULED: {
    label: "Resumption scheduled",
    explanation:
      "An official or vendor-reported resumption window was published for inspection.",
    sourceType: "halt",
    intelSection: "primary-risks",
  },
  RESUMED: {
    label: "Resumed",
    explanation:
      "Trading appears resumed after a halt. Confirm with exchange/vendor status before relying on tape.",
    sourceType: "halt",
    intelSection: "primary-risks",
  },
  DILUTION_RISK: {
    label: "Dilution risk",
    explanation:
      "Dilution-related filing or instrument risk was flagged for this symbol.",
    sourceType: "risk",
    intelSection: "primary-risks",
  },
  OFFERING: {
    label: "Offering",
    explanation:
      "An offering-related disclosure was linked — inspect size, structure, and timing.",
    sourceType: "risk",
    intelSection: "primary-risks",
  },
  STALE_NEWS: {
    label: "Stale news",
    explanation:
      "The catalyst or news item looks aged relative to current tape activity.",
    sourceType: "risk",
    intelSection: "verified-catalyst",
  },
  DATA_DEGRADED: {
    label: "Data degraded",
    explanation:
      "Market data quality dropped (delay, partial outage, or stale quotes). Scores remain inspection-only.",
    sourceType: "data_quality",
    intelSection: "current-state",
  },
  DATA_RECOVERED: {
    label: "Data recovered",
    explanation:
      "Market data quality improved after a degraded period.",
    sourceType: "data_quality",
    intelSection: "current-state",
  },
};

const FORBIDDEN_PHRASES = [
  "buy",
  "sell",
  "long",
  "short",
  "enter",
  "exit",
  "expected return",
  "probability of success",
  "guaranteed",
];

/** Soft check used in tests — catalog must stay inspection-only. */
export function catalogLooksLikeTradeAdvice(text: string): boolean {
  const lower = text.toLowerCase();
  // Allow words inside larger non-instruction phrases carefully:
  // "buy"/"sell" as standalone trade verbs are forbidden.
  for (const p of FORBIDDEN_PHRASES) {
    if (p.includes(" ")) {
      if (lower.includes(p)) return true;
    } else {
      const re = new RegExp(`\\b${p}\\b`, "i");
      if (re.test(lower)) return true;
    }
  }
  return false;
}

export function composeExplanation(
  type: MonitorTapeEventType,
  detail?: string | null
): string {
  const base = TAPE_EVENT_CATALOG[type].explanation;
  const d = detail?.trim();
  if (!d) return base;
  return `${base} ${d}`;
}
