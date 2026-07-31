/**
 * TrustTicker visual system — presentation tokens only.
 * Does not alter classification, ranking, or API behaviour.
 */

export const VISUAL_SYSTEM_VERSION = "visual-system-v1.0";

/** Max context chips on a collapsed feed row (secondary detail → Decision Drawer). */
export const FEED_COLLAPSED_BADGE_MAX = 3;

/** 8px spacing scale */
export const SPACE = {
  1: 4, // tightly related inline
  2: 8, // within metadata groups
  3: 16, // within cards
  4: 24, // between page sections
  5: 32,
  6: 48,
} as const;

export const TYPE = {
  pageTitle: { min: 20, max: 24 },
  sectionTitle: { min: 16, max: 18 },
  feedPrimary: { min: 14, max: 16 },
  metadataMin: 12,
} as const;

export const ICON = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
} as const;

/** Semantic tone ids — pair with text/icons; never colour alone. */
export const TONE = {
  positive: "positive",
  negative: "negative",
  risk: "risk",
  system: "system",
  meta: "meta",
  brand: "brand",
} as const;

export type VisualTone = (typeof TONE)[keyof typeof TONE];

export type CollapsedContextBadge = {
  id: string;
  label: string;
  tone: VisualTone;
  /** Accessible label when colour is used for risk/watchlist */
  icon?: "risk" | "watchlist";
};

/**
 * Pick at most three context badges for a collapsed feed row.
 * Priority: active capital risk → reaction → tradeability.
 * Verification, materiality, and watchlist stay in the Decision Drawer
 * (watchlist may still show as a ticker star).
 */
export function selectCollapsedContextBadges(input: {
  reactionStageLabel: string;
  tradeabilityLabel: string;
  topRiskLabel: string;
  verificationLabel?: string;
  materialityLabel?: string;
}): CollapsedContextBadge[] {
  const out: CollapsedContextBadge[] = [];
  const risk = input.topRiskLabel?.trim();
  const hasActiveRisk =
    !!risk &&
    risk !== "No major capital risk" &&
    !/^none$/i.test(risk);

  if (hasActiveRisk) {
    out.push({
      id: "risk",
      label: risk,
      tone: "risk",
      icon: "risk",
    });
  }

  if (input.reactionStageLabel?.trim()) {
    out.push({
      id: "reaction",
      label: input.reactionStageLabel.trim(),
      tone: "system",
    });
  }

  if (input.tradeabilityLabel?.trim() && out.length < FEED_COLLAPSED_BADGE_MAX) {
    out.push({
      id: "tradeability",
      label: input.tradeabilityLabel.trim(),
      tone: "meta",
    });
  }

  // Fill remaining slots only if no active risk used a slot early
  if (out.length < FEED_COLLAPSED_BADGE_MAX && input.verificationLabel?.trim()) {
    out.push({
      id: "verification",
      label: input.verificationLabel.trim(),
      tone: "system",
    });
  }

  const mat = input.materialityLabel?.trim();
  if (
    out.length < FEED_COLLAPSED_BADGE_MAX &&
    mat &&
    !/^unknown$/i.test(mat)
  ) {
    out.push({
      id: "materiality",
      label: `${mat} materiality`,
      tone: "meta",
    });
  }

  return out.slice(0, FEED_COLLAPSED_BADGE_MAX);
}
