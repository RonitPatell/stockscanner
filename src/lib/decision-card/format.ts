import type { AvailableNumber, LiquidityClass, FloatConfidence } from "./types.ts";

export function avail(
  value: number | null | undefined,
  opts?: { estimated?: boolean; stale?: boolean; note?: string }
): AvailableNumber {
  if (value == null || !Number.isFinite(value)) {
    return { value: null, availability: "unavailable", note: opts?.note ?? "unavailable" };
  }
  if (opts?.stale) return { value, availability: "stale", note: opts.note };
  if (opts?.estimated) return { value, availability: "estimated", note: opts.note };
  return { value, availability: "ok", note: opts?.note };
}

export function unavailable(note = "unavailable"): AvailableNumber {
  return { value: null, availability: "unavailable", note };
}

export function classifyLiquidity(opts: {
  dollarVolume: number | null;
  spreadBps: number | null;
  rVol: number | null;
  floatShares: number | null;
}): LiquidityClass {
  const { dollarVolume, spreadBps, floatShares } = opts;
  if (dollarVolume == null && floatShares == null && spreadBps == null) {
    return "UNAVAILABLE";
  }
  if (spreadBps != null && spreadBps > 200) return "EXTREMELY_THIN";
  if (dollarVolume != null && dollarVolume < 200_000) return "EXTREMELY_THIN";
  if (dollarVolume != null && dollarVolume < 1_000_000) return "THIN";
  if (floatShares != null && floatShares > 0 && floatShares < 5_000_000) {
    if (dollarVolume != null && dollarVolume < 5_000_000) return "THIN";
  }
  if (dollarVolume != null && dollarVolume >= 20_000_000 && (spreadBps == null || spreadBps < 50)) {
    return "LIQUID";
  }
  if (dollarVolume != null && dollarVolume >= 2_000_000) return "ACCEPTABLE";
  if (dollarVolume == null && floatShares != null && floatShares >= 50_000_000) return "ACCEPTABLE";
  return "THIN";
}

export function floatConfidence(
  floatShares: number | null | undefined,
  matchMethod?: string | null
): FloatConfidence {
  if (floatShares == null || !(floatShares > 0)) return "unavailable";
  // Profile-derived float is approximate (shareOutstanding × 0.7 heuristic in market-data)
  if (matchMethod === "cashtag" || matchMethod === "exchange_tag") return "medium";
  return "low";
}

export function pctMove(from: number | null, to: number | null): AvailableNumber {
  if (from == null || to == null || !(from > 0)) return unavailable("missing_price");
  return avail(((to - from) / from) * 100);
}

export function distancePct(ref: number | null, price: number | null): AvailableNumber {
  if (ref == null || price == null || !(ref > 0)) return unavailable();
  return avail(((price - ref) / ref) * 100);
}

export function ageSec(fromIso: string | null | undefined, nowMs: number): number | null {
  if (!fromIso) return null;
  const t = new Date(fromIso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((nowMs - t) / 1000));
}

export function formatAvail(
  field: AvailableNumber,
  opts?: { digits?: number; suffix?: string; prefix?: string }
): string {
  if (field.availability === "unavailable" || field.value == null) return "unavailable";
  const d = opts?.digits ?? 2;
  const prefix = opts?.prefix ?? "";
  const suffix = opts?.suffix ?? "";
  const n = field.value;
  const sign = n > 0 && opts?.suffix === "%" ? "+" : "";
  return `${prefix}${sign}${n.toFixed(d)}${suffix}`;
}
