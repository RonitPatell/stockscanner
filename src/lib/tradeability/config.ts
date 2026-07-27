import type { TradeabilityClass } from "./types.ts";

export interface TradeabilityThresholds {
  liquidMinDollarVolume: number;
  liquidMaxSpreadBps: number;
  acceptableMinDollarVolume: number;
  acceptableMaxSpreadBps: number;
  thinMaxDollarVolume: number;
  extremelyThinSpreadBps: number;
  extremelyThinDollarVolume: number;
  wideSpreadBps: number;
  staleQuoteSec: number;
  lowDollarVolume: number;
  highVolPct: number;
  extendedMovePct: number;
  hysteresisMs: number;
  /** Default illustrative notionals when user has not configured */
  defaultOrderNotionalsUsd: number[];
  minDepthSharesForSufficient: number;
}

const DEFAULTS: TradeabilityThresholds = {
  liquidMinDollarVolume: 20_000_000,
  liquidMaxSpreadBps: 50,
  acceptableMinDollarVolume: 2_000_000,
  acceptableMaxSpreadBps: 100,
  thinMaxDollarVolume: 1_000_000,
  extremelyThinSpreadBps: 200,
  extremelyThinDollarVolume: 200_000,
  wideSpreadBps: 100,
  staleQuoteSec: 30,
  lowDollarVolume: 500_000,
  highVolPct: 4,
  extendedMovePct: 15,
  hysteresisMs: 20_000,
  defaultOrderNotionalsUsd: [1_000, 5_000, 25_000],
  minDepthSharesForSufficient: 500,
};

export function getTradeabilityThresholds(): TradeabilityThresholds {
  return {
    ...DEFAULTS,
    liquidMinDollarVolume: num("TRADEABILITY_LIQUID_MIN_DV", DEFAULTS.liquidMinDollarVolume)!,
    liquidMaxSpreadBps: num("TRADEABILITY_LIQUID_MAX_SPREAD_BPS", DEFAULTS.liquidMaxSpreadBps)!,
    acceptableMinDollarVolume: num(
      "TRADEABILITY_ACCEPTABLE_MIN_DV",
      DEFAULTS.acceptableMinDollarVolume
    )!,
    acceptableMaxSpreadBps: num(
      "TRADEABILITY_ACCEPTABLE_MAX_SPREAD_BPS",
      DEFAULTS.acceptableMaxSpreadBps
    )!,
    extremelyThinSpreadBps: num(
      "TRADEABILITY_EXTREME_SPREAD_BPS",
      DEFAULTS.extremelyThinSpreadBps
    )!,
    extremelyThinDollarVolume: num(
      "TRADEABILITY_EXTREME_DV",
      DEFAULTS.extremelyThinDollarVolume
    )!,
    wideSpreadBps: num("TRADEABILITY_WIDE_SPREAD_BPS", DEFAULTS.wideSpreadBps)!,
    staleQuoteSec: num("TRADEABILITY_STALE_QUOTE_SEC", DEFAULTS.staleQuoteSec)!,
    hysteresisMs: num("TRADEABILITY_HYSTERESIS_MS", DEFAULTS.hysteresisMs)!,
  };
}

function num(env: string, fallback: number): number {
  const raw = process.env[env];
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Rank for hysteresis (higher = more liquid). UNKNOWN treated as lowest. */
export function tradeabilityRank(c: TradeabilityClass): number {
  switch (c) {
    case "LIQUID":
      return 4;
    case "ACCEPTABLE":
      return 3;
    case "THIN":
      return 2;
    case "EXTREMELY_THIN":
      return 1;
    case "UNKNOWN":
    default:
      return 0;
  }
}

export function parseUserIllustrativeNotionals(
  raw: unknown,
  fallback: number[]
): number[] {
  if (Array.isArray(raw)) {
    const nums = raw
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n) && n > 0)
      .slice(0, 5);
    if (nums.length) return nums;
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      return parseUserIllustrativeNotionals(JSON.parse(raw), fallback);
    } catch {
      const nums = raw
        .split(/[,\s]+/)
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n) && n > 0)
        .slice(0, 5);
      if (nums.length) return nums;
    }
  }
  return fallback;
}
