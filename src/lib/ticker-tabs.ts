/**
 * Shared ticker tab ids — safe for server + client.
 */

export type TickerTabId =
  | "overview"
  | "what-changed"
  | "thesis"
  | "financials"
  | "capital"
  | "insiders"
  | "ownership"
  | "filings"
  | "timeline";

/** Public ticker hub tabs — Timeline removed (was placeholder). */
export const TICKER_TAB_IDS = [
  "overview",
  "what-changed",
  "thesis",
  "financials",
  "capital",
  "insiders",
  "ownership",
  "filings",
] as const satisfies readonly TickerTabId[];

/** Research desk includes Capital timeline (dilution events). */
export const RESEARCH_TAB_IDS = [
  ...TICKER_TAB_IDS,
  "timeline",
] as const satisfies readonly TickerTabId[];

const TAB_SET = new Set<string>([...TICKER_TAB_IDS, "timeline"]);

export function parseTickerTab(raw: string | undefined | null): TickerTabId {
  // Legacy public hub alias — Timeline placeholder → What Changed.
  if (raw === "timeline") return "what-changed";
  if (raw && TAB_SET.has(raw) && raw !== "timeline") return raw as TickerTabId;
  return "overview";
}

/** Research accepts timeline as a real Capital dilution timeline panel. */
export function parseResearchTab(raw: string | undefined | null): TickerTabId {
  if (raw === "timeline") return "timeline";
  return parseTickerTab(raw);
}
