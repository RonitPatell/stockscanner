/** Catalyst Feed V3 — presentation-only; does not change classification. */
export const CATALYST_FEED_V3_VERSION = "catalyst-feed-v3.0";

/** Bump key when default visibility of core columns changes (forces fresh defaults). */
export const FEED_V3_PREFS_KEY = "tt-catalyst-feed-v3-prefs-v2";

export type DirectionalImplication =
  | "Positive"
  | "Negative"
  | "Mixed"
  | "Unclear";

export type FeedV3DisplayPrefs = {
  showFloat: boolean;
  showMarketCap: boolean;
  showSentimentScore: boolean;
  showGapperLabel: boolean;
  showAllRisks: boolean;
  showInternalSourceName: boolean;
  showGradeColumn: boolean;
};

export const DEFAULT_FEED_V3_PREFS: FeedV3DisplayPrefs = {
  showFloat: true,
  showMarketCap: true,
  showSentimentScore: false,
  showGapperLabel: false,
  showAllRisks: false,
  showInternalSourceName: false,
  /** Desk letter A–F from materiality / stage / risk */
  showGradeColumn: true,
};

/** Semantic colour tokens — CSS-var backed; never colour-only (pair with text/icons). */
export const FEED_V3_COLORS = {
  positive: {
    text: "tt-tone-positive",
    bg: "bg-[var(--bull-dim)]",
    border: "border-[color:var(--border)]",
    dot: "bg-[var(--tone-positive)]",
  },
  negative: {
    text: "tt-tone-negative",
    bg: "bg-[var(--bear-dim)]",
    border: "border-[color:var(--border)]",
    dot: "bg-[var(--tone-negative)]",
  },
  risk: {
    text: "tt-tone-risk",
    bg: "bg-[var(--warn-dim)]",
    border: "border-[color:var(--border)]",
    dot: "bg-[var(--tone-risk)]",
  },
  system: {
    text: "tt-tone-system",
    bg: "bg-[var(--cyan-dim)]",
    border: "border-[color:var(--border)]",
    dot: "bg-[var(--tone-system)]",
  },
  meta: {
    text: "tt-tone-meta",
    bg: "bg-[var(--bg-elevated)]",
    border: "border-[color:var(--border)]",
    dot: "bg-[var(--text-muted)]",
  },
  brand: {
    text: "tt-tone-brand",
    bg: "bg-[var(--brand-dim)]",
    border: "border-[color:var(--brand-border)]",
    dot: "bg-[var(--tone-brand)]",
  },
} as const;

/** Stable collapsed row height for virtualization (px). */
export const FEED_V3_ROW_HEIGHT_PX = 88;
