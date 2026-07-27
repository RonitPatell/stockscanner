import type { AvailableNumber } from "../decision-card/types.ts";
import type {
  MarketSessionBucket,
  ReactionStage,
  ReactionStageCatalystInput,
  TimestampQualityLabel,
} from "./types.ts";

export type PriceBand = "sub1" | "low" | "mid" | "high";
export type FloatBand = "micro" | "low" | "mid" | "large" | "unknown";
export type LiquidityBand = "thin" | "ok" | "liquid" | "unknown";

export interface StageThresholds {
  /** Max age (sec) for EARLY when other early criteria hold */
  earlyMaxAgeSec: number;
  /** Max age (sec) for ACTIVE window */
  activeMaxAgeSec: number;
  /** Age (sec) beyond which STALE by time alone */
  staleAgeSec: number;
  /** |%| move since publish → EXTENDED */
  extendedMovePct: number;
  /** Day |%| move → EXTENDED */
  extendedDayMovePct: number;
  /** Min |%| post-publish move to count as ACTIVE reaction */
  activeMovePct: number;
  /** Min RVol for ACTIVE */
  activeRvol: number;
  /** Min RVol reinforcing EXTENDED */
  extendedRvol: number;
  /** Wide spread (bps) that blocks EARLY confidence on low float */
  wideSpreadBps: number;
  /** Min dwell (ms) before allowing stage change (hysteresis) */
  hysteresisMs: number;
  /** Require these fields for non-UNKNOWN */
  requirePublishTime: boolean;
  requireCurrentOrIngestPrice: boolean;
}

export interface RuleProfile {
  id: string;
  label: string;
  match: {
    sessions?: MarketSessionBucket[];
    categories?: string[];
    priceBands?: PriceBand[];
    floatBands?: FloatBand[];
    liquidityBands?: LiquidityBand[];
  };
  thresholds: Partial<StageThresholds>;
}

const DEFAULT_THRESHOLDS: StageThresholds = {
  earlyMaxAgeSec: 15 * 60,
  activeMaxAgeSec: 90 * 60,
  staleAgeSec: 6 * 3600,
  extendedMovePct: 12,
  extendedDayMovePct: 25,
  activeMovePct: 1.5,
  activeRvol: 2,
  extendedRvol: 3,
  wideSpreadBps: 150,
  hysteresisMs: 45_000,
  requirePublishTime: true,
  requireCurrentOrIngestPrice: true,
};

/**
 * Configurable profiles — override via REACTION_STAGE_PROFILES_JSON or env scalars.
 * Never claim calibration from defaults alone.
 */
export function getDefaultProfiles(): RuleProfile[] {
  return [
    {
      id: "default",
      label: "Default equities",
      match: {},
      thresholds: {},
    },
    {
      id: "low_float_wide_spread",
      label: "Low-float / wide-spread",
      match: {
        floatBands: ["micro", "low"],
        liquidityBands: ["thin"],
      },
      thresholds: {
        earlyMaxAgeSec: 8 * 60,
        extendedMovePct: 8,
        activeMovePct: 2.5,
        wideSpreadBps: 100,
        hysteresisMs: 90_000,
      },
    },
    {
      id: "afterhours",
      label: "After-hours / premarket",
      match: { sessions: ["afterhours", "premarket"] },
      thresholds: {
        earlyMaxAgeSec: 20 * 60,
        activeMaxAgeSec: 120 * 60,
        extendedMovePct: 10,
        activeRvol: 1.5,
        hysteresisMs: 60_000,
      },
    },
    {
      id: "sec_filing",
      label: "SEC / dilution filings",
      match: { categories: ["sec_filing", "offering", "dilution"] },
      thresholds: {
        earlyMaxAgeSec: 12 * 60,
        extendedMovePct: 10,
        staleAgeSec: 8 * 3600,
      },
    },
    {
      id: "macro_editorial",
      label: "Macro / editorial",
      match: { categories: ["macro", "editorial"] },
      thresholds: {
        earlyMaxAgeSec: 5 * 60,
        staleAgeSec: 3 * 3600,
        activeMovePct: 0.8,
      },
    },
  ];
}

export function loadProfiles(): RuleProfile[] {
  const raw = process.env.REACTION_STAGE_PROFILES_JSON;
  if (raw?.trim()) {
    try {
      const parsed = JSON.parse(raw) as RuleProfile[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      /* fall through */
    }
  }
  return getDefaultProfiles();
}

export function priceBand(price: number | null | undefined): PriceBand {
  if (price == null || !(price > 0)) return "mid";
  if (price < 1) return "sub1";
  if (price < 5) return "low";
  if (price < 50) return "mid";
  return "high";
}

export function floatBand(floatShares: number | null | undefined): FloatBand {
  if (floatShares == null || !(floatShares > 0)) return "unknown";
  if (floatShares < 5_000_000) return "micro";
  if (floatShares < 20_000_000) return "low";
  if (floatShares < 100_000_000) return "mid";
  return "large";
}

export function liquidityBand(input: {
  dollarVolume?: number | null;
  spreadBps?: number | null;
}): LiquidityBand {
  const { dollarVolume, spreadBps } = input;
  if (dollarVolume == null && spreadBps == null) return "unknown";
  if ((spreadBps != null && spreadBps > 150) || (dollarVolume != null && dollarVolume < 500_000)) {
    return "thin";
  }
  if (dollarVolume != null && dollarVolume >= 20_000_000) return "liquid";
  if (dollarVolume != null && dollarVolume >= 2_000_000) return "ok";
  return "thin";
}

function profileMatches(
  p: RuleProfile,
  ctx: {
    session: MarketSessionBucket;
    category: string;
    price: PriceBand;
    float: FloatBand;
    liquidity: LiquidityBand;
  }
): boolean {
  const m = p.match;
  if (m.sessions?.length && !m.sessions.includes(ctx.session)) return false;
  if (m.categories?.length) {
    const cat = ctx.category.toLowerCase();
    if (!m.categories.some((c) => cat.includes(c.toLowerCase()))) return false;
  }
  if (m.priceBands?.length && !m.priceBands.includes(ctx.price)) return false;
  if (m.floatBands?.length && !m.floatBands.includes(ctx.float)) return false;
  if (m.liquidityBands?.length && !m.liquidityBands.includes(ctx.liquidity)) {
    return false;
  }
  return true;
}

export function resolveThresholds(input: {
  session: MarketSessionBucket;
  category: string | null | undefined;
  price: number | null;
  floatShares: number | null;
  dollarVolume: number | null;
  spreadBps: number | null;
}): { profileId: string; thresholds: StageThresholds } {
  const profiles = loadProfiles();
  const ctx = {
    session: input.session,
    category: input.category ?? "unknown",
    price: priceBand(input.price),
    float: floatBand(input.floatShares),
    liquidity: liquidityBand({
      dollarVolume: input.dollarVolume,
      spreadBps: input.spreadBps,
    }),
  };

  // Most specific non-default first
  const ranked = profiles
    .filter((p) => p.id !== "default")
    .filter((p) => profileMatches(p, ctx));
  const chosen = ranked[0] ?? profiles.find((p) => p.id === "default") ?? profiles[0]!;

  const envOverrides: Partial<StageThresholds> = {};
  const early = numEnv("REACTION_STAGE_EARLY_MAX_AGE_SEC");
  const active = numEnv("REACTION_STAGE_ACTIVE_MAX_AGE_SEC");
  const stale = numEnv("REACTION_STAGE_STALE_AGE_SEC");
  const hyst = numEnv("REACTION_STAGE_HYSTERESIS_MS");
  if (early != null) envOverrides.earlyMaxAgeSec = early;
  if (active != null) envOverrides.activeMaxAgeSec = active;
  if (stale != null) envOverrides.staleAgeSec = stale;
  if (hyst != null) envOverrides.hysteresisMs = hyst;

  return {
    profileId: chosen.id,
    thresholds: {
      ...DEFAULT_THRESHOLDS,
      ...chosen.thresholds,
      ...envOverrides,
    },
  };
}

function numEnv(key: string): number | null {
  const raw = process.env[key];
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function bucketsFromInput(input: ReactionStageCatalystInput): {
  price: PriceBand;
  float: FloatBand;
  liquidity: LiquidityBand;
} {
  const price =
    input.tape?.currentPrice ??
    input.priceAtIngestion ??
    input.priceAtPublication ??
    null;
  return {
    price: priceBand(price),
    float: floatBand(input.floatShares),
    liquidity: liquidityBand({
      dollarVolume: input.dollarVolume,
      spreadBps: input.tape?.spreadBps,
    }),
  };
}

export type { StageThresholds as ReactionStageThresholds };
