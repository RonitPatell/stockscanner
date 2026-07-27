import type {
  AlertStrategy,
  ConditionField,
  StrategyCondition,
  StrategyConditionGroup,
} from "./types.ts";

const FIELD_LABELS: Record<ConditionField, string> = {
  watchlist_membership: "watchlist membership",
  price: "price",
  float_m: "float (millions)",
  float_confidence: "float confidence",
  catalyst_category: "catalyst category",
  source_tier: "source tier",
  confirmation_count: "confirmation count",
  catalyst_strength: "catalyst strength",
  reaction_stage: "reaction stage",
  relative_volume: "relative volume",
  dollar_volume: "dollar volume",
  pct_move: "percentage move",
  spread_bps: "spread (bps)",
  tradeability: "tradeability",
  dilution_flag: "dilution flags",
  market_session: "market session",
  halt_status: "halt status",
  max_catalyst_age_min: "catalyst age (minutes)",
  ticker_exclusion: "ticker exclusions",
  sector: "sector",
  exchange: "exchange",
};

function fmtValue(v: StrategyCondition["value"]): string {
  if (v == null) return "—";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

function phraseCondition(c: StrategyCondition): string {
  const label = FIELD_LABELS[c.field] ?? c.field;
  switch (c.op) {
    case "is_true":
      return c.field === "watchlist_membership"
        ? "the ticker is on your watchlist"
        : `${label} is present`;
    case "is_false":
      return c.field === "watchlist_membership"
        ? "the ticker is not on your watchlist"
        : `${label} is absent`;
    case "eq":
      return `${label} equals ${fmtValue(c.value)}`;
    case "neq":
      return `${label} is not ${fmtValue(c.value)}`;
    case "in":
      if (c.field === "ticker_exclusion") {
        return `ticker is not one of: ${fmtValue(c.value)}`;
      }
      return `${label} is one of: ${fmtValue(c.value)}`;
    case "not_in":
      return `${label} is not one of: ${fmtValue(c.value)}`;
    case "gte":
      return `${label} is at least ${fmtValue(c.value)}`;
    case "lte":
      if (c.field === "max_catalyst_age_min") {
        return `catalyst is no older than ${fmtValue(c.value)} minutes`;
      }
      return `${label} is at most ${fmtValue(c.value)}`;
    case "between":
      return `${label} is between ${fmtValue(c.value)}`;
    default:
      return `${label} matches ${fmtValue(c.value)}`;
  }
}

function phraseGroup(group: StrategyConditionGroup): string {
  const parts: string[] = [
    ...group.conditions.map(phraseCondition),
    ...(group.groups ?? []).map((g) => `(${phraseGroup(g)})`),
  ];
  if (parts.length === 0) return "any event";
  const joiner = group.logic === "AND" ? " and " : " or ";
  return parts.join(joiner);
}

const DELIVERY_PHRASE: Record<AlertStrategy["delivery"], string> = {
  EARLY: "as soon as a verified catalyst prints (before market confirmation)",
  CONFIRMED: "only after your selected market confirmation checks pass",
  RISK_ONLY: "only for capital, regulatory, or structural risk",
};

/**
 * Plain-language “This rule will alert when…” summary.
 */
export function summarizeStrategy(strategy: AlertStrategy): {
  headline: string;
  when: string;
  delivery: string;
  channels: string;
  limits: string;
  mutes: string | null;
} {
  const when = phraseGroup(strategy.root);
  const channels = strategy.channels.length
    ? strategy.channels.join(", ")
    : "no channels";
  const cap =
    strategy.dailyAlertCap != null
      ? `max ${strategy.dailyAlertCap}/day`
      : "no daily cap";
  const limits = `${strategy.cooldownMinutes} min cooldown · ${cap}`;
  let mutes: string | null = null;
  if (strategy.mutes) {
    const bits: string[] = [];
    if (strategy.mutes.tickers?.length)
      bits.push(`tickers ${strategy.mutes.tickers.join(", ")}`);
    if (strategy.mutes.categories?.length)
      bits.push(`categories ${strategy.mutes.categories.join(", ")}`);
    if (strategy.mutes.sessions?.length)
      bits.push(`sessions ${strategy.mutes.sessions.join(", ")}`);
    if (strategy.mutes.until) bits.push(`until ${strategy.mutes.until}`);
    if (bits.length) mutes = `Temporarily muted: ${bits.join("; ")}`;
  }

  return {
    headline: `This rule will alert when ${when}.`,
    when,
    delivery: `Delivery: ${DELIVERY_PHRASE[strategy.delivery]}.`,
    channels: `Channels: ${channels}.`,
    limits: `Limits: ${limits}.`,
    mutes,
  };
}

export function summarizeStrategyPlain(strategy: AlertStrategy): string {
  const s = summarizeStrategy(strategy);
  return [s.headline, s.delivery, s.channels, s.limits, s.mutes]
    .filter(Boolean)
    .join(" ");
}
