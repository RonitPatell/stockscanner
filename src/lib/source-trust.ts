export type SourceTier = "wire" | "exchange" | "aggregator" | "other";

const WIRE_SOURCES = new Set([
  "GlobeNewswire",
  "Business Wire",
  "PR Newswire",
  "SEC EDGAR",
  "AccessWire",
]);

const EXCHANGE_SOURCES = new Set(["Yahoo Finance", "Nasdaq"]);

const AGGREGATOR_SOURCES = new Set([
  "MarketWatch",
  "CNBC",
  "Seeking Alpha",
  "Benzinga",
  "Business Insider",
  "Reuters",
  "Bloomberg",
  "Finnhub",
]);

export function getSourceTier(source: string): SourceTier {
  if (WIRE_SOURCES.has(source) || source.includes("Wire") || source.includes("Newswire")) {
    return "wire";
  }
  if (EXCHANGE_SOURCES.has(source)) return "exchange";
  if (AGGREGATOR_SOURCES.has(source)) return "aggregator";
  return "other";
}

export function sourceTierLabel(tier: SourceTier): string {
  switch (tier) {
    case "wire":
      return "Wire";
    case "exchange":
      return "Exchange";
    case "aggregator":
      return "News";
    default:
      return "Source";
  }
}

export function sourceTierBadgeClass(tier: SourceTier): string {
  switch (tier) {
    case "wire":
      return "border-emerald-500/40 text-emerald-400 bg-emerald-500/10";
    case "exchange":
      return "border-cyan-500/40 text-cyan-400 bg-cyan-500/10";
    case "aggregator":
      return "border-amber-500/40 text-amber-400 bg-amber-500/10";
    default:
      return "border-zinc-600 text-zinc-400 bg-zinc-800/60";
  }
}

export function confidenceLabel(score: number | null | undefined): string | null {
  if (score == null) return null;
  if (score >= 70) return "High confidence";
  if (score >= 45) return "Verified";
  if (score >= 25) return "Likely";
  return null;
}
