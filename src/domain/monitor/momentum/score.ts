import {
  liquidityBucket,
  priorDollarVelScale,
  priorTradeRateScale,
  priorVelocityScale,
  priceBucket,
} from "./buckets.ts";
import { normalizedWeights } from "./config.ts";
import type { SymbolBaseline, MarketActivityBaseline } from "./baseline.ts";
import {
  capAbs,
  clamp01to100,
  intensityFromAbsZ,
  median,
  mad,
  round1,
  round2,
  signedIntensityFromZ,
  winsorize,
} from "./robust.ts";
import type {
  ComponentContribution,
  ComponentId,
  DataQualityPenalty,
  MomentumConfidence,
  MomentumDirection,
  MomentumRawFeatures,
  MomentumResult,
  SessionMomentumConfig,
} from "./types.ts";
import { MONITOR_MOMENTUM_VERSION } from "./version.ts";

interface NormContext {
  features: MomentumRawFeatures;
  baseline: SymbolBaseline;
  market: ReturnType<MarketActivityBaseline["snapshot"]>;
  config: SessionMomentumConfig;
  priceB: ReturnType<typeof priceBucket>;
  liqB: ReturnType<typeof liquidityBucket>;
}

interface CompOut {
  id: ComponentId;
  intensity: number;
  signed: number;
  available: boolean;
  note?: string;
  missing?: string;
}

function robustIntensity(
  x: number | null,
  series: number[],
  priorScale: number,
  config: SessionMomentumConfig,
  signed: boolean
): { intensity: number; signed: number; available: boolean; note?: string } {
  if (x == null || !Number.isFinite(x)) {
    return { intensity: 0, signed: 0, available: false, note: "missing" };
  }

  // Blend symbol baseline with prior scale when thin history.
  let med = median(series);
  let m = mad(series, med);
  if (med == null || series.length < 5) {
    med = 0;
    m = priorScale;
  } else {
    const scale = Math.max(priorScale * 0.25, (m ?? 0) * 1.4826);
    m = scale / 1.4826;
  }

  const lo = (med ?? 0) - config.winsorMadMult * Math.max(m ?? priorScale, 1e-12);
  const hi = (med ?? 0) + config.winsorMadMult * Math.max(m ?? priorScale, 1e-12);
  const wx = winsorize(x, lo, hi);

  const scale = Math.max(1e-12, (m ?? priorScale) * 1.4826);
  let z = (wx - (med ?? 0)) / scale;
  z = capAbs(z, config.zCap);

  // Market-wide dampener when symbol is only matching a busy tape (not unique).
  // Applied by caller for burst components when market reliable.

  if (signed) {
    return {
      intensity: intensityFromAbsZ(z, config.zCap),
      signed: signedIntensityFromZ(z, config.zCap),
      available: true,
    };
  }
  // Unsigned bursts: use max(0, z) so dormancy → low intensity.
  const posZ = Math.max(0, z);
  return {
    intensity: intensityFromAbsZ(posZ, config.zCap),
    signed: 0,
    available: true,
  };
}

function computeComponents(ctx: NormContext): CompOut[] {
  const f = ctx.features;
  const b = ctx.baseline;
  const cfg = ctx.config;
  const pvScale = priorVelocityScale(ctx.priceB, ctx.liqB);
  const trScale = priorTradeRateScale(ctx.liqB);
  const dvScale = priorDollarVelScale(ctx.priceB, ctx.liqB);

  const priceVel = robustIntensity(
    f.priceVelocity,
    b.series("priceVelocity", f.asOfMs),
    pvScale,
    cfg,
    true
  );

  const priceAcc = robustIntensity(
    f.priceAcceleration,
    b.series("priceAcceleration", f.asOfMs),
    pvScale / 5,
    cfg,
    true
  );

  let tradeBurst = robustIntensity(
    f.tradesPerSecond,
    b.series("tradesPerSecond", f.asOfMs),
    trScale,
    cfg,
    false
  );
  tradeBurst = applyMarketRelative(
    tradeBurst,
    f.tradesPerSecond,
    ctx.market.medianTradeRate,
    ctx.market.reliable
  );

  const tradeAcc = robustIntensity(
    f.tradeRateAcceleration,
    b.series("tradeRateAcceleration", f.asOfMs),
    trScale / 3,
    cfg,
    true
  );

  const shareBurst = robustIntensity(
    f.shareVolumeVelocity,
    b.series("shareVolumeVelocity", f.asOfMs),
    trScale * 200,
    cfg,
    false
  );

  let dollarBurst = robustIntensity(
    f.dollarVolumeVelocity != null
      ? Math.abs(f.dollarVolumeVelocity)
      : null,
    b.series("dollarVolumeVelocity", f.asOfMs).map(Math.abs),
    dvScale,
    cfg,
    false
  );
  dollarBurst = applyMarketRelative(
    dollarBurst,
    f.dollarVolumeVelocity != null
      ? Math.abs(f.dollarVolumeVelocity)
      : null,
    ctx.market.medianDollarVel,
    ctx.market.reliable
  );

  const rvol = robustIntensity(
    f.relativeVolume,
    b.series("relativeVolume", f.asOfMs),
    1,
    cfg,
    false
  );

  // HOD/LOD pressure: proximity to extreme with directional sign from which side.
  const hodLod = hodLodComponent(f, b, cfg);

  const vwap = vwapComponent(f, b, cfg);

  const quoteInt = robustIntensity(
    f.quoteUpdateRate,
    b.series("quoteUpdateRate", f.asOfMs),
    0.5,
    cfg,
    false
  );

  const sustained = sustainedParticipation(f);

  return [
    {
      id: "priceVelocity",
      intensity: priceVel.intensity,
      signed: priceVel.signed,
      available: priceVel.available,
      note: priceVel.note,
      missing: priceVel.available ? undefined : "priceVelocity",
    },
    {
      id: "priceAcceleration",
      intensity: priceAcc.intensity,
      signed: priceAcc.signed,
      available: priceAcc.available,
      note: priceAcc.note,
      missing: priceAcc.available ? undefined : "priceAcceleration",
    },
    {
      id: "tradeRateBurst",
      intensity: tradeBurst.intensity,
      signed: 0,
      available: tradeBurst.available,
      missing: tradeBurst.available ? undefined : "tradesPerSecond",
    },
    {
      id: "tradeRateAcceleration",
      intensity: tradeAcc.intensity,
      signed: tradeAcc.signed,
      available: tradeAcc.available,
      missing: tradeAcc.available ? undefined : "tradeRateAcceleration",
    },
    {
      id: "shareVolumeBurst",
      intensity: shareBurst.intensity,
      signed: 0,
      available: shareBurst.available,
      missing: shareBurst.available ? undefined : "shareVolumeVelocity",
    },
    {
      id: "dollarVolumeBurst",
      intensity: dollarBurst.intensity,
      signed: 0,
      available: dollarBurst.available,
      missing: dollarBurst.available ? undefined : "dollarVolumeVelocity",
    },
    {
      id: "relativeVolumeIntensity",
      intensity: rvol.intensity,
      signed: 0,
      available: rvol.available,
      missing: rvol.available ? undefined : "relativeVolume",
    },
    hodLod,
    vwap,
    {
      id: "quoteUpdateIntensity",
      intensity: quoteInt.intensity,
      signed: 0,
      available: quoteInt.available,
      missing: quoteInt.available ? undefined : "quoteUpdateRate",
    },
    sustained,
  ];
}

function applyMarketRelative(
  comp: { intensity: number; signed: number; available: boolean; note?: string },
  value: number | null,
  marketMed: number | null,
  reliable: boolean
): { intensity: number; signed: number; available: boolean; note?: string } {
  if (!comp.available || !reliable || value == null || marketMed == null || marketMed <= 0) {
    return comp;
  }
  // If symbol is merely matching market median activity, dampen uniqueness.
  const ratio = value / marketMed;
  if (ratio < 1.25) {
    const scale = winsorize(ratio / 1.25, 0.35, 1);
    return {
      ...comp,
      intensity: round1(comp.intensity * scale),
      note: "market_relative_dampen",
    };
  }
  return comp;
}

function hodLodComponent(
  f: MomentumRawFeatures,
  b: SymbolBaseline,
  cfg: SessionMomentumConfig
): CompOut {
  if (f.distanceFromHod == null && f.distanceFromLod == null) {
    return {
      id: "hodLodPressure",
      intensity: 0,
      signed: 0,
      available: false,
      missing: "distanceFromHod|distanceFromLod",
    };
  }
  // distanceFromHod = (last−hod)/hod → 0 at HOD; distanceFromLod = (last−lod)/lod → 0 at LOD.
  const hodScore =
    f.distanceFromHod != null
      ? clamp01to100(100 * Math.exp(-Math.abs(f.distanceFromHod) * 80))
      : 0;
  const lodScore =
    f.distanceFromLod != null
      ? clamp01to100(100 * Math.exp(-Math.abs(f.distanceFromLod) * 80))
      : 0;

  let intensity = Math.max(hodScore, lodScore);
  const prox = Math.min(
    f.distanceFromHod != null ? Math.abs(f.distanceFromHod) : Infinity,
    f.distanceFromLod != null ? Math.abs(f.distanceFromLod) : Infinity
  );
  const series = b.series("absHodLod", f.asOfMs);
  if (Number.isFinite(prox) && series.length >= 5) {
    const ri = robustIntensity(prox, series, 0.02, cfg, false);
    // Unusual proximity vs own baseline adds intensity; blend with absolute nearness.
    intensity = clamp01to100(0.55 * intensity + 0.45 * ri.intensity);
  }

  // Soft cap: HOD/LOD alone cannot max the engine.
  intensity = clamp01to100(Math.min(intensity, 100 * (cfg.maxComponentShare + 0.35)));

  let signed = 0;
  if (hodScore >= lodScore && hodScore > 10) signed = intensity;
  else if (lodScore > hodScore && lodScore > 10) signed = -intensity;

  return {
    id: "hodLodPressure",
    intensity: round1(intensity),
    signed: round1(signed),
    available: true,
  };
}

function vwapComponent(
  f: MomentumRawFeatures,
  b: SymbolBaseline,
  cfg: SessionMomentumConfig
): CompOut {
  if (f.distanceFromVwap == null) {
    return {
      id: "vwapDisplacement",
      intensity: 0,
      signed: 0,
      available: false,
      missing: "distanceFromVwap",
    };
  }
  const abs = Math.abs(f.distanceFromVwap);
  const ri = robustIntensity(
    abs,
    b.series("absVwapDisp", f.asOfMs),
    0.005,
    cfg,
    false
  );
  const signed = f.distanceFromVwap >= 0 ? ri.intensity : -ri.intensity;
  return {
    id: "vwapDisplacement",
    intensity: ri.intensity,
    signed: round1(signed),
    available: ri.available,
  };
}

/**
 * Sustained participation: mid-window trades vs short burst.
 * One-print spike → low; gradual/sustained → high.
 */
function sustainedParticipation(f: MomentumRawFeatures): CompOut {
  const short = f.tradeCountShort;
  const mid = f.tradeCountMid;
  if (short == null) {
    return {
      id: "sustainedParticipationQuality",
      intensity: 0,
      signed: 0,
      available: false,
      missing: "tradeCountShort",
    };
  }
  if (short <= 1) {
    return {
      id: "sustainedParticipationQuality",
      intensity: 5,
      signed: 0,
      available: true,
      note: "single_or_sparse_prints",
    };
  }
  if (mid == null || mid <= 0) {
    // Only short window — moderate if many prints in 15s.
    const intensity = clamp01to100(Math.min(80, short * 6));
    return {
      id: "sustainedParticipationQuality",
      intensity: round1(intensity),
      signed: 0,
      available: true,
      note: "no_mid_window",
    };
  }
  // Ratio of mid/short activity continuity; short<<mid means building;
  // short≈mid with tiny mid means spike.
  const continuity = mid / Math.max(short, 1);
  let intensity: number;
  if (short >= 8 && mid >= 20 && continuity >= 1.5) {
    intensity = clamp01to100(55 + Math.min(45, mid));
  } else if (short <= 3 && mid <= 5) {
    intensity = 12;
  } else if (short >= 10 && mid < short * 1.2) {
    // Burst concentrated in short window only.
    intensity = 25;
  } else {
    intensity = clamp01to100(20 + continuity * 15 + Math.min(30, mid));
  }
  return {
    id: "sustainedParticipationQuality",
    intensity: round1(intensity),
    signed: 0,
    available: true,
  };
}

function applyWeights(
  comps: CompOut[],
  config: SessionMomentumConfig
): ComponentContribution[] {
  let weights = normalizedWeights(config.weights);
  // Open-burst dampener on trade-rate components.
  if (config.openBurstTradeRateScale < 1) {
    weights = {
      ...weights,
      tradeRateBurst: weights.tradeRateBurst * config.openBurstTradeRateScale,
      tradeRateAcceleration:
        weights.tradeRateAcceleration * config.openBurstTradeRateScale,
    };
    weights = normalizedWeights(weights);
  }

  const raw: ComponentContribution[] = comps.map((c) => {
    const w = weights[c.id];
    const contribution = c.available ? round2(c.intensity * w) : 0;
    return {
      id: c.id,
      contribution,
      intensity: round1(c.intensity),
      signed: round1(c.signed),
      weight: round2(w),
      available: c.available,
      note: c.note,
    };
  });

  // Cap any single component's contribution share of the pre-penalty total.
  let sum = raw.reduce((a, c) => a + c.contribution, 0);
  if (sum > 0) {
    const maxShare = config.maxComponentShare;
    for (const c of raw) {
      const share = c.contribution / sum;
      if (share > maxShare) {
        c.contribution = round2(sum * maxShare);
        c.note = c.note
          ? `${c.note};component_share_capped`
          : "component_share_capped";
      }
    }
    sum = raw.reduce((a, c) => a + c.contribution, 0);
  }

  return raw;
}

function directionFromComponents(
  comps: ComponentContribution[]
): MomentumDirection {
  let signed = 0;
  let weight = 0;
  for (const c of comps) {
    if (!c.available) continue;
    if (
      c.id === "priceVelocity" ||
      c.id === "priceAcceleration" ||
      c.id === "vwapDisplacement" ||
      c.id === "hodLodPressure"
    ) {
      signed += c.signed * c.weight;
      weight += c.weight;
    }
  }
  if (weight <= 0) return "neutral";
  const avg = signed / weight;
  if (avg > 8) return "up";
  if (avg < -8) return "down";
  return "neutral";
}

function qualityPenalties(
  f: MomentumRawFeatures,
  config: SessionMomentumConfig
): DataQualityPenalty[] {
  const out: DataQualityPenalty[] = [];
  if (f.halted) {
    out.push({
      code: "halted",
      points: 100,
      detail: f.haltReason
        ? `Symbol halted (${f.haltReason}); intensity suppressed`
        : "Symbol halted; intensity suppressed",
    });
  }
  const age = f.sourceDataAgeMs;
  if (age != null && age > config.hardStaleMs) {
    out.push({
      code: "hard_stale",
      points: 40,
      detail: `Source data age ${age}ms exceeds hard stale ${config.hardStaleMs}ms`,
    });
  } else if (age != null && age > config.staleMs) {
    out.push({
      code: "stale",
      points: 15,
      detail: `Source data age ${age}ms exceeds soft stale ${config.staleMs}ms`,
    });
  }
  if (f.quoteStaleOrCrossed || f.spreadFlagged) {
    out.push({
      code: "quote_quality",
      points: 10,
      detail: "Quote stale, crossed, or flagged — not a trading-risk score",
    });
  }
  if (
    f.spreadBps != null &&
    f.spreadBps > config.wideSpreadBps &&
    (f.tradesPerSecond == null || f.tradesPerSecond < 0.5)
  ) {
    out.push({
      code: "wide_spread_low_volume",
      points: 20,
      detail: `Wide spread (${round1(f.spreadBps)} bps) with low trade rate`,
    });
  }
  if ((f.tradeCountShort ?? 0) <= 1 && (f.priceVelocity != null && Math.abs(f.priceVelocity) > 0)) {
    out.push({
      code: "single_print_guard",
      points: 35,
      detail: "One-print / sparse tape guard — prevents max score from a single print",
    });
  }
  return out;
}

function confidenceOf(
  f: MomentumRawFeatures,
  comps: ComponentContribution[],
  penalties: DataQualityPenalty[],
  config: SessionMomentumConfig
): MomentumConfidence {
  if (f.halted) return "UNAVAILABLE";
  if (
    penalties.some((p) => p.code === "hard_stale") ||
    (f.sourceDataAgeMs != null && f.sourceDataAgeMs > config.hardStaleMs)
  ) {
    return "UNAVAILABLE";
  }
  const available = comps.filter((c) => c.available).length;
  if (available < 3) return "UNAVAILABLE";

  const trades = f.tradeCountShort ?? 0;
  const penaltyPts = penalties.reduce((a, p) => a + p.points, 0);
  if (trades >= config.minTradesForHigh && available >= 8 && penaltyPts < 15) {
    return "HIGH";
  }
  if (trades >= config.minTradesForMedium && available >= 5 && penaltyPts < 40) {
    return "MEDIUM";
  }
  return "LOW";
}

function explain(
  intensity: number,
  direction: MomentumDirection,
  confidence: MomentumConfidence,
  top: ComponentContribution[],
  penalties: DataQualityPenalty[]
): string {
  const dir =
    direction === "up"
      ? "upward"
      : direction === "down"
        ? "downward"
        : direction === "neutral"
          ? "directionally mixed/neutral"
          : "direction unavailable";
  const tops = top
    .filter((c) => c.available && c.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3)
    .map((c) => c.id)
    .join(", ");
  const pen =
    penalties.length > 0
      ? ` Data-quality adjustments: ${penalties.map((p) => p.code).join(", ")}.`
      : "";
  return (
    `Momentum intensity ${intensity}/100 reflects ${dir} activity concentration` +
    (tops ? ` (lead components: ${tops})` : "") +
    `. Confidence ${confidence}.` +
    ` Score measures unusual activity intensity, not trade attractiveness.` +
    pen
  );
}

export function scoreMomentum(input: {
  features: MomentumRawFeatures;
  baseline: SymbolBaseline;
  market: ReturnType<MarketActivityBaseline["snapshot"]>;
  config: SessionMomentumConfig;
  calculatedAtMs: number;
}): MomentumResult {
  const f = input.features;
  const priceB = priceBucket(f.lastPrice);
  const liqB = liquidityBucket(f.avgDailyVolume);
  const missingInputs: string[] = [];

  const comps = computeComponents({
    features: f,
    baseline: input.baseline,
    market: input.market,
    config: input.config,
    priceB,
    liqB,
  });
  for (const c of comps) {
    if (c.missing) missingInputs.push(c.missing);
  }

  const weighted = applyWeights(comps, input.config);
  let intensity = weighted.reduce((a, c) => a + c.contribution, 0);
  // Map weighted sum (≈0–100 if components ~100) — already on contribution scale.
  intensity = clamp01to100(intensity);

  const penalties = qualityPenalties(f, input.config);
  const penaltyPts = penalties.reduce((a, p) => a + p.points, 0);
  intensity = clamp01to100(intensity - penaltyPts);

  // Hard halt → force 0.
  if (f.halted) intensity = 0;

  const direction = f.halted
    ? "unavailable"
    : directionFromComponents(weighted);
  const confidence = confidenceOf(f, weighted, penalties, input.config);

  let signedMomentum = 0;
  if (direction === "up") signedMomentum = intensity;
  else if (direction === "down") signedMomentum = -intensity;

  // Re-scale contributions to sum to final intensity for explainability.
  const prePenalty = weighted.reduce((a, c) => a + c.contribution, 0);
  let contributions = weighted;
  if (prePenalty > 0 && intensity >= 0) {
    const scale = intensity / prePenalty;
    // When penalties wipe score, keep relative shares of pre-penalty then zero.
    if (penaltyPts > 0 && intensity === 0) {
      contributions = weighted.map((c) => ({ ...c, contribution: 0 }));
    } else if (Math.abs(scale - 1) > 0.001) {
      contributions = weighted.map((c) => ({
        ...c,
        contribution: round2(c.contribution * scale),
      }));
    }
  }

  const result: MomentumResult = {
    symbol: f.symbol,
    calcVersion: MONITOR_MOMENTUM_VERSION,
    calculatedAt: new Date(input.calculatedAtMs).toISOString(),
    sourceDataAgeMs: f.sourceDataAgeMs,
    momentumIntensity: round1(intensity),
    signedMomentum: round1(signedMomentum),
    direction,
    confidence,
    components: contributions,
    missingInputs: [...new Set(missingInputs)],
    dataQualityPenalties: penalties,
    session: f.session,
    priceBucket: priceB,
    liquidityBucket: liqB,
    explanation: "",
  };
  result.explanation = explain(
    result.momentumIntensity,
    result.direction,
    result.confidence,
    result.components,
    result.dataQualityPenalties
  );
  return result;
}
