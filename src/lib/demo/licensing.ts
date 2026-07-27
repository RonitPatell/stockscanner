import type { DemoMode } from "./types.ts";

/** Sources we treat as redistribution-permitted for delayed public demo (issuer/SEC). */
export const REDISTRIBUTION_PERMITTED_SOURCES = new Set([
  "SEC EDGAR",
  "GlobeNewswire",
  "Business Wire",
  "PR Newswire",
  "AccessWire",
]);

/** Editorial / licensed aggregators — headline metadata + link only; body text redacted. */
export const LICENSED_OR_EDITORIAL_SOURCES = new Set([
  "Benzinga",
  "Benzinga API",
  "Finnhub",
  "MarketWatch",
  "CNBC",
  "Seeking Alpha",
  "Business Insider",
  "Reuters",
  "Bloomberg",
  "Yahoo Finance",
  "Nasdaq",
]);

export function isRedistributionPermitted(source: string): boolean {
  if (REDISTRIBUTION_PERMITTED_SOURCES.has(source)) return true;
  if (source.includes("Wire") || source.includes("Newswire")) return true;
  if (source === "SEC EDGAR" || /^SEC\b/i.test(source)) return true;
  return false;
}

export function mustRedactLicensedText(source: string): boolean {
  if (isRedistributionPermitted(source)) return false;
  if (LICENSED_OR_EDITORIAL_SOURCES.has(source)) return true;
  // Default-deny: unknown aggregators get redacted body text
  return true;
}

export function getConfiguredDemoMode(): DemoMode {
  const raw = (process.env.DEMO_MODE ?? "DELAYED_REAL").trim().toUpperCase();
  if (raw === "HISTORICAL_REPLAY" || raw === "CURATED_CASES" || raw === "DELAYED_REAL") {
    return raw;
  }
  return "DELAYED_REAL";
}

export function getDemoDelayMinutes(): number {
  const n = Number(process.env.DEMO_DELAY_MINUTES ?? "30");
  if (!Number.isFinite(n) || n < 5) return 30;
  return Math.min(24 * 60, Math.floor(n));
}

export function demoModeLabel(mode: DemoMode): string {
  switch (mode) {
    case "DELAYED_REAL":
      return "Delayed real catalysts";
    case "HISTORICAL_REPLAY":
      return "Historical session replay";
    case "CURATED_CASES":
      return "Curated historical cases";
  }
}
