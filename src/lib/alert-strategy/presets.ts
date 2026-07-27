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

export function buildPreset(presetId: StrategyPresetId): AlertStrategy {
  switch (presetId) {
    case "low_float_momentum":
      return base(
        presetId,
        "Low-Float Momentum",
        "CONFIRMED",
        group("AND", [
          cond("watchlist_membership", "is_true", true),
          cond("float_m", "lte", 20),
          cond("relative_volume", "gte", 2.5),
          cond("pct_move", "gte", 4),
          cond("tradeability", "in", ["ACCEPTABLE", "THIN", "LIQUID"]),
          cond("max_catalyst_age_min", "lte", 90),
        ]),
        { cooldownMinutes: 20, dailyAlertCap: 30 }
      );
    case "biotech_catalyst":
      return base(
        presetId,
        "Biotech Catalyst",
        "EARLY",
        group("AND", [
          cond("catalyst_category", "in", ["fda", "earnings"]),
          cond("source_tier", "in", ["wire", "exchange"]),
          cond("max_catalyst_age_min", "lte", 30),
          cond("halt_status", "neq", "halted"),
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
          cond("float_m", "gte", 50),
          cond("tradeability", "in", ["LIQUID", "ACCEPTABLE"]),
          cond("source_tier", "in", ["wire", "exchange", "aggregator"]),
          cond("spread_bps", "lte", 50),
          cond("max_catalyst_age_min", "lte", 60),
        ]),
        { cooldownMinutes: 15, dailyAlertCap: 50 }
      );
    case "dilution_offering_risk":
      return base(
        presetId,
        "Dilution and Offering Risk",
        "RISK_ONLY",
        group("AND", [
          cond("dilution_flag", "is_true", true),
          cond("max_catalyst_age_min", "lte", 240),
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
    case "custom":
    default:
      return base(
        "custom",
        "Custom strategy",
        "EARLY",
        group("AND", [
          cond("watchlist_membership", "is_true", true),
          cond("max_catalyst_age_min", "lte", 120),
        ]),
        { channels: ["discord"] }
      );
  }
}

export const STRATEGY_PRESET_META: Array<{
  id: StrategyPresetId;
  label: string;
  blurb: string;
}> = [
  {
    id: "low_float_momentum",
    label: "Low-Float Momentum",
    blurb: "Watchlist names with small float, elevated RVol, and confirmed move.",
  },
  {
    id: "biotech_catalyst",
    label: "Biotech Catalyst",
    blurb: "Early FDA/earnings-style prints from trusted wires — before tape confirmation.",
  },
  {
    id: "large_cap_news",
    label: "Large-Cap News",
    blurb: "Liquid large floats with tight spreads and fresh primary/aggregator news.",
  },
  {
    id: "dilution_offering_risk",
    label: "Dilution and Offering Risk",
    blurb: "RISK_ONLY capital-structure alerts — not momentum.",
  },
  {
    id: "watchlist_risk_monitor",
    label: "Watchlist Risk Monitor",
    blurb: "Offerings, filings, and downgrades on your watchlist only.",
  },
  {
    id: "custom",
    label: "Custom",
    blurb: "Start blank and build your own AND/OR groups.",
  },
];
