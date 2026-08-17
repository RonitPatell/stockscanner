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

export const TICKER_TAB_IDS: TickerTabId[] = [
  "overview",
  "what-changed",
  "thesis",
  "financials",
  "capital",
  "insiders",
  "ownership",
  "filings",
  "timeline",
];

const TAB_SET = new Set<string>(TICKER_TAB_IDS);

export function parseTickerTab(raw: string | undefined | null): TickerTabId {
  if (raw && TAB_SET.has(raw)) return raw as TickerTabId;
  return "overview";
}
