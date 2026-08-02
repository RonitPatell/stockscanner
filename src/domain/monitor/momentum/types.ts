import type { SessionSegment } from "../market-state/session.ts";

export type MomentumConfidence = "HIGH" | "MEDIUM" | "LOW" | "UNAVAILABLE";

export type MomentumDirection = "up" | "down" | "neutral" | "unavailable";

export type PriceBucket =
  | "sub_1"
  | "1_5"
  | "5_20"
  | "20_100"
  | "100_plus"
  | "unknown";

export type LiquidityBucket =
  | "ultra_thin"
  | "thin"
  | "moderate"
  | "liquid"
  | "unknown";

export type ComponentId =
  | "priceVelocity"
  | "priceAcceleration"
  | "tradeRateBurst"
  | "tradeRateAcceleration"
  | "shareVolumeBurst"
  | "dollarVolumeBurst"
  | "relativeVolumeIntensity"
  | "hodLodPressure"
  | "vwapDisplacement"
  | "quoteUpdateIntensity"
  | "sustainedParticipationQuality";

export interface ComponentContribution {
  id: ComponentId;
  /** Unsigned contribution to intensity after weight (0–100 scale share). */
  contribution: number;
  /** Normalized component intensity 0–100 (activity magnitude). */
  intensity: number;
  /** Signed component −100…+100 where direction applies; 0 if N/A. */
  signed: number;
  weight: number;
  available: boolean;
  note?: string;
}

export interface DataQualityPenalty {
  code: string;
  /** Points subtracted from intensity (activity reliability), not trading risk. */
  points: number;
  detail: string;
}

export interface MomentumResult {
  symbol: string;
  calcVersion: string;
  calculatedAt: string;
  sourceDataAgeMs: number | null;
  /** 0–100: unusually intense current activity — not a trade recommendation. */
  momentumIntensity: number;
  /**
   * Signed activity: +up / −down. Magnitude equals momentumIntensity when
   * direction is up/down; 0 when neutral/unavailable.
   */
  signedMomentum: number;
  direction: MomentumDirection;
  confidence: MomentumConfidence;
  components: ComponentContribution[];
  missingInputs: string[];
  dataQualityPenalties: DataQualityPenalty[];
  session: SessionSegment;
  priceBucket: PriceBucket;
  liquidityBucket: LiquidityBucket;
  /** Short deterministic explanation (no advice language). */
  explanation: string;
}

export interface MomentumSnapshot {
  version: string;
  symbol: string;
  asOfMs: number;
  result: MomentumResult;
}

/** Raw feature vector extracted from market-state (pre-normalization). */
export interface MomentumRawFeatures {
  symbol: string;
  asOfMs: number;
  session: SessionSegment;
  lastPrice: number | null;
  sourceDataAgeMs: number | null;
  halted: boolean;
  haltReason: string | null;
  /** Prefer short-window price velocity ($/sec), signed. */
  priceVelocity: number | null;
  priceAcceleration: number | null;
  tradesPerSecond: number | null;
  tradeRateAcceleration: number | null;
  shareVolumeVelocity: number | null;
  dollarVolumeVelocity: number | null;
  relativeVolume: number | null;
  distanceFromHod: number | null;
  distanceFromLod: number | null;
  distanceFromVwap: number | null;
  quoteUpdateRate: number | null;
  spreadBps: number | null;
  spreadFlagged: boolean;
  quoteStaleOrCrossed: boolean;
  /** Fraction of short-window samples with reliable side (0–1) if known. */
  sideReliability: number | null;
  /** Trade count in primary window — for participation quality. */
  tradeCountShort: number | null;
  tradeCountMid: number | null;
  avgDailyVolume: number | null;
}

export interface ComponentWeightMap {
  priceVelocity: number;
  priceAcceleration: number;
  tradeRateBurst: number;
  tradeRateAcceleration: number;
  shareVolumeBurst: number;
  dollarVolumeBurst: number;
  relativeVolumeIntensity: number;
  hodLodPressure: number;
  vwapDisplacement: number;
  quoteUpdateIntensity: number;
  sustainedParticipationQuality: number;
}

export interface SessionMomentumConfig {
  segment: SessionSegment;
  weights: ComponentWeightMap;
  /** Max |robust-z| before intensity saturates. */
  zCap: number;
  /** Winsorize raw feature vs baseline at this many MADs. */
  winsorMadMult: number;
  /** Stale data age (ms) before quality penalty. */
  staleMs: number;
  /** Hard stale — confidence UNAVAILABLE. */
  hardStaleMs: number;
  /** Cap single-component intensity share of total (0–1). */
  maxComponentShare: number;
  /** Minimum trades in short window for HIGH confidence. */
  minTradesForHigh: number;
  /** Minimum trades for MEDIUM. */
  minTradesForMedium: number;
  /** Spread bps above which thin-book penalty applies. */
  wideSpreadBps: number;
  /** Open-burst dampener on trade-rate components (0–1 multiplier on weight). */
  openBurstTradeRateScale: number;
}

export interface MomentumEngineOptions {
  sessionConfigs?: Partial<Record<SessionSegment, Partial<SessionMomentumConfig>>>;
  snapshotIntervalMs?: number;
  now?: () => number;
  /** Baseline ring length per symbol. */
  baselineCapacity?: number;
  /** Injected store — domain default is in-memory. */
  snapshotStore?: {
    put(snapshot: MomentumSnapshot): Promise<void> | void;
    putMany(snapshots: MomentumSnapshot[]): Promise<void> | void;
    get(symbol: string): Promise<MomentumSnapshot | null> | MomentumSnapshot | null;
  };
}
