import type { HorizonMetrics, PriceSnapshot } from "../calibration/types.ts";
import {
  dilutionStatusFromInputs,
  floatBucket,
  gapBucket,
  implicationFromInputs,
  liquidityBucket,
  priceBucket,
  reactionStageBucket,
  rvolBucket,
  sessionAt,
  subtypeFromHeadline,
} from "./buckets.ts";
import {
  adjustPriceForSplits,
  resolveSymbolAsOf,
  type CorporateActionFactor,
} from "./corporate-actions.ts";
import type {
  AnalogueEventOutcome,
  AnalogueFeatureVector,
  AnalogueHorizonKey,
} from "./types.ts";
import { ANALOGUE_HORIZONS } from "./types.ts";

export interface FeatureBuildInput {
  catalystId: string;
  symbol: string;
  headline: string;
  publishedAt: string | Date;
  ingestedAt: string | Date;
  catalystType?: string | null;
  sourceTier?: string | null;
  price?: number | null;
  floatShares?: number | null;
  volume?: number | null;
  avgVolume?: number | null;
  changePercent?: number | null;
  sentimentLabel?: string | null;
  sentimentScore?: number | null;
  setupTags?: string[] | null;
  judgment?: {
    directionalImplication?: string | null;
    version?: string | null;
    flags?: string[] | null;
  } | null;
  reactionStage?: string | null;
  sector?: string | null;
  marketRegime?: AnalogueFeatureVector["marketRegime"] | null;
  dollarVolume?: number | null;
  rVol?: number | null;
  corporateActions?: CorporateActionFactor[];
  /** Reference price for unlisted split detection */
  referencePrice?: number | null;
  asOf?: string | Date;
}

/**
 * Build a feature vector using only fields available at historical event time.
 * Corporate-action adjustments applied when factors known; otherwise suspect paths excluded.
 */
export function buildFeatureVector(
  input: FeatureBuildInput
): AnalogueFeatureVector {
  const factors = input.corporateActions ?? [];
  const asOf = input.asOf ?? input.ingestedAt;
  const symInfo = resolveSymbolAsOf({
    symbol: input.symbol,
    asOf,
    factors,
  });

  const adj = adjustPriceForSplits({
    symbol: input.symbol,
    historicalPrice: input.price,
    historicalAt: input.ingestedAt,
    referenceAt: asOf,
    factors,
    referencePrice: input.referencePrice,
  });

  const category = (input.catalystType ?? "other").toLowerCase();
  const rVol =
    input.rVol ??
    (input.avgVolume && input.volume && input.avgVolume > 0
      ? input.volume / input.avgVolume
      : null);

  let excludeReason: string | null = null;
  if (adj.excluded) excludeReason = adj.reason;
  if (symInfo.delisted && !input.price) {
    excludeReason = excludeReason ?? "delisted_missing_price";
  }

  return {
    catalystId: input.catalystId,
    symbol: symInfo.symbol,
    ingestedAt: new Date(input.ingestedAt).toISOString(),
    publishedAt: new Date(input.publishedAt).toISOString(),
    category,
    subtype: subtypeFromHeadline(category, input.headline),
    implication: implicationFromInputs({
      directionalImplication: input.judgment?.directionalImplication,
      sentimentLabel: input.sentimentLabel,
      sentimentScore: input.sentimentScore,
      setupTags: input.setupTags,
    }),
    sourceTier: input.sourceTier ?? null,
    marketSession: sessionAt(input.ingestedAt),
    priceBucket: priceBucket(adj.price ?? input.price),
    floatBucket: floatBucket(input.floatShares),
    liquidityBucket: liquidityBucket({
      dollarVolume: input.dollarVolume,
      volume: input.volume,
      price: adj.price ?? input.price,
      avgVolume: input.avgVolume,
    }),
    rvolBucket: rvolBucket(rVol),
    gapBucket: gapBucket(input.changePercent),
    reactionStage: reactionStageBucket(input.reactionStage),
    sector: input.sector ?? null,
    dilutionStatus: dilutionStatusFromInputs({
      catalystType: input.catalystType,
      setupTags: input.setupTags,
      headline: input.headline,
      judgmentFlags: input.judgment?.flags,
    }),
    marketRegime: input.marketRegime ?? "unknown",
    classificationVersion: input.judgment?.version ?? null,
    entryPrice: adj.price,
    delistedOrChanged: symInfo.delisted || symInfo.changed,
    splitAdjusted: adj.adjusted,
    excludeReason,
  };
}

/**
 * Parse outcome metrics JSON / convenience columns into AnalogueEventOutcome.
 * Excludes invalid / corrupted horizons (look-ahead safe: uses stored snapshots only).
 */
export function buildEventOutcome(opts: {
  catalystId: string;
  symbol: string;
  metrics?: HorizonMetrics[] | Record<string, HorizonMetrics> | null;
  snapshots?: Partial<Record<string, PriceSnapshot>> | null;
  mfePct?: number | null;
  maePct?: number | null;
  spreadPct?: number | null;
  dollarVolume?: number | null;
  halted?: boolean;
  dataComplete?: boolean;
  excludeReason?: string | null;
}): AnalogueEventOutcome {
  const returns: Partial<Record<AnalogueHorizonKey, number | null>> = {};
  const metricsList: HorizonMetrics[] = Array.isArray(opts.metrics)
    ? opts.metrics
    : opts.metrics
      ? Object.values(opts.metrics)
      : [];

  for (const h of ANALOGUE_HORIZONS) {
    const m = metricsList.find((x) => x.horizon === h);
    if (m) {
      if (
        !m.sampleValid ||
        m.invalidReason ||
        m.rawReturnPct == null ||
        !Number.isFinite(m.rawReturnPct)
      ) {
        returns[h] = null;
      } else {
        returns[h] = m.rawReturnPct;
      }
    } else {
      returns[h] = null;
    }
  }

  // Convenience: if only primary columns exist
  if (
    returns.m15 == null &&
    opts.mfePct != null &&
    metricsList.length === 0 &&
    opts.snapshots
  ) {
    // leave nulls — don't invent
  }

  const entry = opts.snapshots?.ingest?.price ?? null;
  const m5 = opts.snapshots?.m5?.price ?? null;
  const closeOrM15 =
    opts.snapshots?.m15?.price ?? opts.snapshots?.close?.price ?? null;

  let stayedAboveEntry: boolean | null = null;
  if (entry != null && entry > 0 && closeOrM15 != null) {
    stayedAboveEntry = closeOrM15 >= entry;
  }

  let fellBelowFiveMin: boolean | null = null;
  if (m5 != null && m5 > 0 && closeOrM15 != null) {
    fellBelowFiveMin = closeOrM15 < m5;
  }

  // Also check later horizons vs m5
  if (m5 != null && m5 > 0) {
    for (const h of ["m15", "m30", "m60", "close"] as AnalogueHorizonKey[]) {
      const px = opts.snapshots?.[h]?.price;
      if (px != null && px < m5) {
        fellBelowFiveMin = true;
        break;
      }
    }
  }

  const anyValid = ANALOGUE_HORIZONS.some((h) => returns[h] != null);
  const invalidReason =
    opts.excludeReason ??
    (!anyValid
      ? opts.dataComplete === false
        ? "incomplete_outcome"
        : "missing_horizon_returns"
      : null);

  return {
    catalystId: opts.catalystId,
    symbol: opts.symbol,
    returns,
    mfePct:
      opts.mfePct != null && Number.isFinite(opts.mfePct) ? opts.mfePct : null,
    maePct:
      opts.maePct != null && Number.isFinite(opts.maePct) ? opts.maePct : null,
    stayedAboveEntry,
    fellBelowFiveMin,
    medianSpreadPct:
      opts.spreadPct != null && Number.isFinite(opts.spreadPct)
        ? opts.spreadPct
        : null,
    liquidityDollarVol:
      opts.dollarVolume != null && Number.isFinite(opts.dollarVolume)
        ? opts.dollarVolume
        : null,
    halted: Boolean(opts.halted),
    valid: anyValid && !invalidReason,
    invalidReason,
  };
}

/**
 * Prevent look-ahead: candidate must be strictly before query ingest time.
 */
export function isBeforeQuery(
  candidateIngestedAt: string,
  queryIngestedAt: string
): boolean {
  const c = Date.parse(candidateIngestedAt);
  const q = Date.parse(queryIngestedAt);
  if (!Number.isFinite(c) || !Number.isFinite(q)) return false;
  return c < q;
}
