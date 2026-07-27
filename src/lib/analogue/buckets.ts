import {
  floatBucket,
  liquidityBucket,
  sessionAt,
} from "../calibration/buckets.ts";
import type {
  AnalogueImplication,
  DilutionStatus,
  GapBucket,
  PriceBucket,
  ReactionStageBucket,
  RvolBucket,
} from "./types.ts";

export { floatBucket, liquidityBucket, sessionAt };

export function priceBucket(price: number | null | undefined): PriceBucket {
  if (price == null || !(price > 0)) return "unknown";
  if (price < 1) return "sub1";
  if (price < 5) return "low";
  if (price < 20) return "mid";
  return "high";
}

export function rvolBucket(rVol: number | null | undefined): RvolBucket {
  if (rVol == null || !Number.isFinite(rVol) || rVol < 0) return "unknown";
  if (rVol < 0.8) return "quiet";
  if (rVol < 2) return "normal";
  if (rVol < 5) return "elevated";
  return "extreme";
}

/** Gap / day-move at event observation (ingest change %). */
export function gapBucket(changePercent: number | null | undefined): GapBucket {
  if (changePercent == null || !Number.isFinite(changePercent)) return "unknown";
  const a = Math.abs(changePercent);
  if (a < 1) return "flat";
  if (a < 3) return "small";
  if (a < 8) return "medium";
  return "large";
}

export function implicationFromInputs(opts: {
  directionalImplication?: string | null;
  sentimentLabel?: string | null;
  sentimentScore?: number | null;
  setupTags?: string[] | null;
}): AnalogueImplication {
  const d = (opts.directionalImplication ?? "").toUpperCase();
  if (
    d === "POSITIVE" ||
    d === "NEGATIVE" ||
    d === "MIXED" ||
    d === "UNCLEAR"
  ) {
    return d;
  }
  const tags = opts.setupTags ?? [];
  if (tags.some((t) => /dilution|offering|trap/i.test(t))) {
    if ((opts.sentimentScore ?? 0) > 20) return "MIXED";
  }
  const label = (opts.sentimentLabel ?? "").toLowerCase();
  if (label.includes("very_bullish") || label === "bullish") return "POSITIVE";
  if (label === "bearish" || label.includes("very_bearish")) return "NEGATIVE";
  if (opts.sentimentScore != null) {
    if (opts.sentimentScore >= 25) return "POSITIVE";
    if (opts.sentimentScore <= -25) return "NEGATIVE";
  }
  return "UNCLEAR";
}

export function dilutionStatusFromInputs(opts: {
  catalystType?: string | null;
  setupTags?: string[] | null;
  headline?: string | null;
  judgmentFlags?: string[] | null;
}): DilutionStatus {
  const text = `${opts.headline ?? ""} ${(opts.setupTags ?? []).join(" ")} ${(opts.judgmentFlags ?? []).join(" ")}`;
  const type = (opts.catalystType ?? "").toLowerCase();
  if (
    type.includes("offering") ||
    /dilut|offering|atm\b|registered\s+direct|424b|warrant|convertible/i.test(
      text
    )
  ) {
    return "dilution_risk";
  }
  if (opts.setupTags?.some((t) => /dilution|offering/i.test(t))) {
    return "dilution_risk";
  }
  if (opts.headline || opts.catalystType) return "clean";
  return "unknown";
}

export function reactionStageBucket(
  stage: string | null | undefined
): ReactionStageBucket {
  const s = (stage ?? "").toUpperCase();
  if (
    s === "EARLY" ||
    s === "ACTIVE" ||
    s === "EXTENDED" ||
    s === "STALE" ||
    s === "UNKNOWN"
  ) {
    return s;
  }
  return "UNKNOWN";
}

export function subtypeFromHeadline(
  category: string | null | undefined,
  headline: string | null | undefined
): string | null {
  const h = headline ?? "";
  const c = (category ?? "other").toLowerCase();
  if (/8-?k\b/i.test(h)) return "8k";
  if (/10-?[qk]\b/i.test(h)) return "periodic_filing";
  if (/atm\b|at-the-market/i.test(h)) return "atm";
  if (/registered\s+direct/i.test(h)) return "registered_direct";
  if (/fda|pdufa|advisory\s+committee/i.test(h)) return "fda_event";
  if (/phase\s*[123]/i.test(h)) return "clinical";
  if (/earnings|eps\b|revenue/i.test(h) || c === "earnings") return "earnings";
  if (/merger|acquire|acquisition/i.test(h)) return "mna";
  if (/upgrade/i.test(h)) return "upgrade";
  if (/downgrade/i.test(h)) return "downgrade";
  return c || null;
}

/** Ordered buckets for adjacent matching */
export const PRICE_ORDER: PriceBucket[] = ["sub1", "low", "mid", "high"];
export const FLOAT_ORDER = ["micro", "small", "mid", "large"] as const;
export const LIQ_ORDER = ["thin", "moderate", "liquid"] as const;
export const RVOL_ORDER: RvolBucket[] = ["quiet", "normal", "elevated", "extreme"];
export const GAP_ORDER: GapBucket[] = ["flat", "small", "medium", "large"];
export const SESSION_ORDER = [
  "premarket",
  "regular",
  "afterhours",
] as const;
export const IMPLICATION_ADJACENT: Record<
  AnalogueImplication,
  AnalogueImplication[]
> = {
  POSITIVE: ["POSITIVE", "MIXED"],
  NEGATIVE: ["NEGATIVE", "MIXED"],
  MIXED: ["MIXED", "POSITIVE", "NEGATIVE", "UNCLEAR"],
  UNCLEAR: ["UNCLEAR", "MIXED"],
};

export function adjacentInOrder<T extends string>(
  order: readonly T[],
  a: string,
  b: string
): boolean {
  if (a === b) return true;
  if (a === "unknown" || b === "unknown") return false;
  const ia = order.indexOf(a as T);
  const ib = order.indexOf(b as T);
  if (ia < 0 || ib < 0) return false;
  return Math.abs(ia - ib) <= 1;
}
