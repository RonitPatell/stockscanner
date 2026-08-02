import { ALERT_STRATEGY_SCHEMA_VERSION } from "./version.ts";
import type {
  AlertStrategy,
  StrategyCondition,
  StrategyConditionGroup,
  StrategyPresetId,
  DeliveryBehaviour,
} from "./types.ts";

function id(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function cond(
  field: StrategyCondition["field"],
  op: StrategyCondition["op"],
  value: StrategyCondition["value"]
): StrategyCondition {
  return { id: id("c"), field, op, value };
}

function group(
  logic: "AND" | "OR",
  conditions: StrategyCondition[],
  groups?: StrategyConditionGroup[]
): StrategyConditionGroup {
  return { id: id("g"), logic, conditions, groups };
}

function base(
  presetId: StrategyPresetId,
  name: string,
  delivery: DeliveryBehaviour,
  root: StrategyConditionGroup,
  extras?: Partial<AlertStrategy>
): AlertStrategy {
  const now = new Date().toISOString();
  return {
    id: id("strat"),
    schemaVersion: ALERT_STRATEGY_SCHEMA_VERSION,
    version: 1,
    name,
    enabled: true,
    presetId,
    delivery,
    channels: ["discord", "push"],
    root,
    cooldownMinutes: 15,
    dailyAlertCap: 40,
    mutes: null,
    createdAt: now,
    updatedAt: now,
    ...extras,
  };
}

/**
 * Build a catalog preset template.
 * Templates are always version 1 copies — never mutate a saved strategy in place.
 */
export function buildPreset(presetId: StrategyPresetId): AlertStrategy {
  switch (presetId) {
    case "low_float_momentum":
      return base(
        presetId,
        "Low-Float Momentum",
        "CONFIRMED",
        group("AND", [
          cond("price", "between", [0.5, 20]),
          cond("float_m", "lte", 20),
          cond("float_confidence", "in", ["high", "medium"]),
          cond("momentum_state", "in", [
            "EMERGING",
            "BUILDING",
            "BREAKING",
            "ACTIVE",
            "RECLAIMING",
          ]),
          cond("momentum_intensity", "gte", 40),
          cond("attention_priority", "gte", 45),
          cond("relative_volume", "gte", 2.5),
          cond("dollar_volume_velocity", "gte", 150_000),
          cond("trades_per_second", "gte", 5),
          cond("spread_bps", "lte", 120),
          cond("tradeability", "in", ["ACCEPTABLE", "THIN", "LIQUID"]),
          cond("market_session", "in", ["premarket", "regular"]),
          cond("risk_flag", "not_in", ["offering"]),
        ]),
        { cooldownMinutes: 20, dailyAlertCap: 30 }
      );
    case "biotech_catalyst":
      return base(
        presetId,
        "Biotech Catalysts",
        "EARLY",
        group("AND", [
          cond("catalyst_category", "in", ["fda", "earnings", "clinical"]),
          cond("source_tier", "in", ["wire", "exchange"]),
          cond("source_verification", "in", ["verified", "partial"]),
          cond("sector", "in", ["Healthcare", "Biotechnology", "Health Care"]),
          cond("max_catalyst_age_min", "lte", 45),
          cond("halt_status", "neq", "halted"),
          cond("attention_priority", "gte", 35),
        ]),
        {
          channels: ["discord", "email", "push"],
          cooldownMinutes: 30,
        }
      );
    case "large_cap_news":
      return base(
        presetId,
        "Large-Cap News",
        "EARLY",
        group("AND", [
          cond("market_cap_m", "gte", 2_000),
          cond("float_m", "gte", 50),
          cond("tradeability", "in", ["LIQUID", "ACCEPTABLE"]),
          cond("source_tier", "in", ["wire", "exchange", "aggregator"]),
          cond("source_verification", "in", ["verified", "partial"]),
          cond("spread_bps", "lte", 50),
          cond("max_catalyst_age_min", "lte", 60),
          cond("market_session", "in", ["premarket", "regular", "afterhours"]),
        ]),
        { cooldownMinutes: 15, dailyAlertCap: 50 }
      );
    case "downside_momentum":
      return base(
        presetId,
        "Downside Momentum",
        "CONFIRMED",
        group("AND", [
          cond("pct_move", "lte", -3),
          cond("momentum_state", "in", [
            "BREAKING",
            "FADING",
            "COOLING",
            "ACTIVE",
          ]),
          cond("momentum_intensity", "gte", 40),
          cond("attention_priority", "gte", 40),
          cond("relative_volume", "gte", 2),
          cond("trades_per_second", "gte", 4),
          cond("spread_bps", "lte", 150),
          cond("tradeability", "in", ["ACCEPTABLE", "THIN", "LIQUID"]),
          cond("market_session", "in", ["premarket", "regular"]),
        ]),
        { cooldownMinutes: 20, dailyAlertCap: 35 }
      );
    case "halt_resumption":
      return base(
        presetId,
        "Halt and Resumption",
        "RISK_ONLY",
        group("OR", [
          cond("halt_status", "eq", "halted"),
          cond("resumption_flag", "is_true", true),
        ]),
        {
          channels: ["discord", "sms", "push"],
          cooldownMinutes: 10,
          dailyAlertCap: 60,
        }
      );
    case "dilution_offering_risk":
      return base(
        presetId,
        "Dilution and Offering Risk",
        "RISK_ONLY",
        group("AND", [
          cond("risk_flag", "in", [
            "dilution",
            "offering",
            "atm",
            "warrants",
            "shelf",
          ]),
          cond("max_catalyst_age_min", "lte", 240),
          cond("attention_priority", "gte", 30),
        ]),
        {
          channels: ["discord", "sms", "email", "push"],
          cooldownMinutes: 60,
          dailyAlertCap: 20,
        }
      );
    case "watchlist_risk_monitor":
      return base(
        presetId,
        "Watchlist Risk Monitor",
        "RISK_ONLY",
        group("AND", [
          cond("watchlist_membership", "is_true", true),
          cond(
            "catalyst_category",
            "in",
            ["offering", "sec_filing", "downgrade"]
          ),
        ]),
        { cooldownMinutes: 45 }
      );
    case "watchlist_only":
      return base(
        presetId,
        "Watchlist Only",
        "EARLY",
        group("AND", [
          cond("watchlist_membership", "is_true", true),
          cond("attention_priority", "gte", 20),
        ]),
        {
          channels: ["discord", "push"],
          cooldownMinutes: 10,
          dailyAlertCap: 80,
        }
      );
    case "custom":
    default:
      return base(
        "custom",
        "Custom",
        "EARLY",
        group("AND", [
          cond("watchlist_membership", "is_true", true),
          cond("momentum_intensity", "gte", 30),
          cond("attention_priority", "gte", 30),
        ]),
        { channels: ["discord"] }
      );
  }
}

export const STRATEGY_PRESET_META: Array<{
  id: StrategyPresetId;
  label: string;
  blurb: string;
  /** Shown in Monitor preset picker */
  monitorFacing?: boolean;
}> = [
  {
    id: "low_float_momentum",
    label: "Low-Float Momentum",
    blurb:
      "Small float, elevated intensity/RVol, upward lifecycle states — inspection filter.",
    monitorFacing: true,
  },
  {
    id: "biotech_catalyst",
    label: "Biotech Catalysts",
    blurb: "FDA/clinical/earnings-style biotech prints from trusted wires.",
    monitorFacing: true,
  },
  {
    id: "large_cap_news",
    label: "Large-Cap News",
    blurb: "Large market-cap / float names with tight spreads and fresh verified news.",
    monitorFacing: true,
  },
  {
    id: "downside_momentum",
    label: "Downside Momentum",
    blurb: "Negative session move with elevated downside participation.",
    monitorFacing: true,
  },
  {
    id: "halt_resumption",
    label: "Halt and Resumption",
    blurb: "Official halt state or resumption flag — risk inspection.",
    monitorFacing: true,
  },
  {
    id: "dilution_offering_risk",
    label: "Dilution and Offering Risk",
    blurb: "Capital-structure risk flags (dilution, ATM, offering, warrants).",
    monitorFacing: true,
  },
  {
    id: "watchlist_only",
    label: "Watchlist Only",
    blurb: "Restrict the Monitor ladder to watchlist membership.",
    monitorFacing: true,
  },
  {
    id: "watchlist_risk_monitor",
    label: "Watchlist Risk Monitor",
    blurb: "Offerings, filings, and downgrades on your watchlist (alerts).",
    monitorFacing: false,
  },
  {
    id: "custom",
    label: "Custom",
    blurb: "Start from a blank AND group and edit in the Alert Strategy Builder.",
    monitorFacing: true,
  },
];

export const MONITOR_PRESET_IDS: StrategyPresetId[] = STRATEGY_PRESET_META.filter(
  (p) => p.monitorFacing !== false
).map((p) => p.id);
