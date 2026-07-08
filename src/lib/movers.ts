import type { CatalystItem } from "@/types";

/** Minimum |% change| to show regular news */
export const MIN_MOVE_PERCENT = 2.5;

/** SEC 8-Ks need a bigger move — routine filings rarely matter */
export const MIN_SEC_MOVE_PERCENT = 5;

/** Fresh press releases can appear before the move shows up */
export const FRESH_PR_WINDOW_MS = 4 * 60 * 60 * 1000;
export const FRESH_NEWS_WINDOW_MS = 3 * 60 * 60 * 1000;
export const FRESH_PR_MIN_MOVE = 1.0;

const PR_SOURCES = new Set(["GlobeNewswire", "Business Wire"]);
const LIVE_NEWS_SOURCES = new Set([
  "GlobeNewswire",
  "Business Wire",
  "Benzinga",
  "Reuters",
  "CNBC",
  "Bloomberg",
  "MarketWatch",
  "The Motley Fool",
  "Seeking Alpha",
]);

export function isMoverCatalyst(c: {
  source: string;
  changePercent?: number | null;
  publishedAt: string;
  sentimentScore?: number | null;
  catalystType?: string | null;
}): boolean {
  const move = Math.abs(c.changePercent ?? 0);
  const age = Date.now() - new Date(c.publishedAt).getTime();

  // Always surface recent wire / market news regardless of price move
  if (age < FRESH_NEWS_WINDOW_MS) {
    if (PR_SOURCES.has(c.source) || LIVE_NEWS_SOURCES.has(c.source)) return true;
    if (!c.source.includes("SEC")) return true;
  }

  if (c.source === "SEC EDGAR" || c.catalystType === "sec_filing") {
    return move >= MIN_SEC_MOVE_PERCENT;
  }

  if (PR_SOURCES.has(c.source) && age < FRESH_PR_WINDOW_MS) {
    return move >= FRESH_PR_MIN_MOVE || (c.sentimentScore ?? 0) >= 35;
  }

  return move >= MIN_MOVE_PERCENT;
}

export function sortByRecency(a: CatalystItem, b: CatalystItem): number {
  return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
}

export function sortByMoverPriority(a: CatalystItem, b: CatalystItem): number {
  const moveDiff = Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0);
  if (Math.abs(moveDiff) > 0.05) return moveDiff;
  return sortByRecency(a, b);
}

export function moverScore(changePercent: number | null | undefined): number {
  return Math.abs(changePercent ?? 0);
}
