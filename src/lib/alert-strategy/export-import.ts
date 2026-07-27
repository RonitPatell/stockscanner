import { ALERT_STRATEGY_SCHEMA_VERSION } from "./version.ts";
import { validateStrategy } from "./validate.ts";
import { ensureConditionIds } from "./versioning.ts";
import type {
  AlertStrategy,
  DeliveryBehaviour,
  StrategyPresetId,
  StrategyMute,
} from "./types.ts";
import type { AlertRuleChannel } from "../alert-rules.ts";

export interface StrategyExportBundle {
  format: "trustticker-alert-strategy";
  schemaVersion: string;
  exportedAt: string;
  strategies: AlertStrategy[];
}

const PRESETS: StrategyPresetId[] = [
  "low_float_momentum",
  "biotech_catalyst",
  "large_cap_news",
  "dilution_offering_risk",
  "watchlist_risk_monitor",
  "custom",
];

const DELIVERIES: DeliveryBehaviour[] = ["EARLY", "CONFIRMED", "RISK_ONLY"];
const CHANNELS: AlertRuleChannel[] = ["discord", "sms", "email", "push"];

function isObj(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function parseMute(raw: unknown): StrategyMute | null {
  if (!isObj(raw)) return null;
  return {
    tickers: Array.isArray(raw.tickers) ? raw.tickers.map(String) : undefined,
    categories: Array.isArray(raw.categories)
      ? raw.categories.map(String)
      : undefined,
    sessions: Array.isArray(raw.sessions)
      ? raw.sessions.filter(
          (s): s is NonNullable<StrategyMute["sessions"]>[number] =>
            s === "premarket" ||
            s === "regular" ||
            s === "afterhours" ||
            s === "weekend"
        )
      : undefined,
    until: typeof raw.until === "string" ? raw.until : null,
  };
}

export function parseStrategy(raw: unknown): AlertStrategy | null {
  if (!isObj(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id : null;
  if (!id) return null;
  const delivery = DELIVERIES.includes(raw.delivery as DeliveryBehaviour)
    ? (raw.delivery as DeliveryBehaviour)
    : "EARLY";
  const presetId = PRESETS.includes(raw.presetId as StrategyPresetId)
    ? (raw.presetId as StrategyPresetId)
    : "custom";
  const channels: AlertRuleChannel[] = Array.isArray(raw.channels)
    ? raw.channels.filter((c): c is AlertRuleChannel =>
        CHANNELS.includes(c as AlertRuleChannel)
      )
    : ["discord"];
  if (!isObj(raw.root)) return null;

  const root = ensureConditionIds({
    id: typeof raw.root.id === "string" ? raw.root.id : "root",
    logic: raw.root.logic === "OR" ? "OR" : "AND",
    conditions: Array.isArray(raw.root.conditions)
      ? (raw.root.conditions as AlertStrategy["root"]["conditions"])
      : [],
    groups: Array.isArray(raw.root.groups)
      ? (raw.root.groups as AlertStrategy["root"]["groups"])
      : [],
  });

  const now = new Date().toISOString();
  return {
    id,
    schemaVersion:
      typeof raw.schemaVersion === "string"
        ? raw.schemaVersion
        : ALERT_STRATEGY_SCHEMA_VERSION,
    version:
      typeof raw.version === "number" && Number.isFinite(raw.version)
        ? Math.max(1, Math.floor(raw.version))
        : 1,
    name: typeof raw.name === "string" ? raw.name : "Imported strategy",
    enabled: raw.enabled !== false,
    presetId,
    delivery,
    channels: channels.length > 0 ? channels : (["discord"] as AlertRuleChannel[]),
    root,
    cooldownMinutes:
      typeof raw.cooldownMinutes === "number" && Number.isFinite(raw.cooldownMinutes)
        ? raw.cooldownMinutes
        : 15,
    dailyAlertCap:
      typeof raw.dailyAlertCap === "number" && Number.isFinite(raw.dailyAlertCap)
        ? raw.dailyAlertCap
        : null,
    mutes: parseMute(raw.mutes),
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : now,
    userNote: typeof raw.userNote === "string" ? raw.userNote : null,
  };
}

export function exportStrategies(strategies: AlertStrategy[]): StrategyExportBundle {
  // Strip nothing sensitive — strategies must not contain phone/watchlist lists
  return {
    format: "trustticker-alert-strategy",
    schemaVersion: ALERT_STRATEGY_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    strategies: strategies.map((s) => structuredClone(s)),
  };
}

export function importStrategies(
  raw: unknown,
  opts?: { replaceIds?: boolean }
): {
  ok: boolean;
  strategies: AlertStrategy[];
  errors: string[];
} {
  const errors: string[] = [];
  let list: unknown[] = [];

  if (isObj(raw) && raw.format === "trustticker-alert-strategy") {
    if (!Array.isArray(raw.strategies)) {
      return { ok: false, strategies: [], errors: ["Missing strategies array"] };
    }
    list = raw.strategies;
  } else if (Array.isArray(raw)) {
    list = raw;
  } else if (isObj(raw) && raw.id) {
    list = [raw];
  } else {
    return { ok: false, strategies: [], errors: ["Unrecognized JSON format"] };
  }

  const strategies: AlertStrategy[] = [];
  for (let i = 0; i < list.length; i++) {
    const parsed = parseStrategy(list[i]);
    if (!parsed) {
      errors.push(`Item ${i}: invalid strategy`);
      continue;
    }
    if (opts?.replaceIds) {
      parsed.id = `imported_${Date.now()}_${i}`;
      parsed.version = 1;
    }
    const v = validateStrategy(parsed);
    if (!v.ok) {
      errors.push(
        `Item ${i} (${parsed.name}): ${v.issues
          .filter((x) => x.severity === "error")
          .map((x) => x.message)
          .join("; ")}`
      );
      continue;
    }
    strategies.push(parsed);
  }

  return {
    ok: strategies.length > 0 && errors.length === 0,
    strategies,
    errors,
  };
}
