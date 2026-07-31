/**
 * TradingView symbol helpers.
 * Prefer bare US tickers — prefixing NASDAQ: breaks NYSE/AMEX/ARCA names.
 * Only use EXCHANGE:SYMBOL when we know the listing venue.
 */

const TV_EXCHANGES = new Set([
  "NASDAQ",
  "NYSE",
  "AMEX",
  "ARCA",
  "BATS",
  "NYSEARCA",
  "OTC",
]);

function normalizeExchange(exchange?: string | null): string | null {
  if (!exchange) return null;
  const ex = exchange.toUpperCase().replace(/\s+/g, "");
  if (ex === "NMS" || ex === "NGM" || ex === "NCM" || ex === "XNAS") return "NASDAQ";
  if (ex === "NYQ" || ex === "XNYS") return "NYSE";
  if (ex === "ASE" || ex === "XASE") return "AMEX";
  if (ex === "ARC" || ex === "NYSEARCA" || ex === "ARCX") return "ARCA";
  if (TV_EXCHANGES.has(ex)) return ex;
  return null;
}

/** Exchange:SYMBOL when exchange known; otherwise bare ticker (TV resolves). */
export function tradingViewSymbol(
  symbol: string,
  exchange?: string | null
): string {
  const sym = symbol.toUpperCase().replace(/[^A-Z0-9.-]/g, "");
  const ex = normalizeExchange(exchange);
  if (ex && ex !== "OTC") return `${ex}:${sym}`;
  // Bare symbol — TradingView's US resolver finds NYSE/NASDAQ/AMEX correctly.
  // Hardcoding NASDAQ: was why many charts failed to load.
  return sym;
}

/** Deep links into charts / brokers for US equities */
export function tradingViewUrl(symbol: string, exchange?: string | null): string {
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(
    tradingViewSymbol(symbol, exchange)
  )}`;
}

export function finvizUrl(symbol: string): string {
  return `https://finviz.com/quote.ashx?t=${encodeURIComponent(symbol)}`;
}

export function yahooFinanceUrl(symbol: string): string {
  return `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`;
}

export function webullUrl(symbol: string): string {
  return `https://www.webull.com/quote/nasdaq-${encodeURIComponent(symbol.toLowerCase())}`;
}

/** thinkorswim web quote page */
export function thinkorswimUrl(symbol: string): string {
  return `https://trade.thinkorswim.com/trade?symbol=${encodeURIComponent(symbol)}`;
}

export function brokerDeepLinks(symbol: string) {
  const sym = symbol.toUpperCase();
  return [
    { id: "tv", label: "TradingView", href: tradingViewUrl(sym) },
    { id: "finviz", label: "Finviz", href: finvizUrl(sym) },
    { id: "yahoo", label: "Yahoo", href: yahooFinanceUrl(sym) },
    { id: "webull", label: "Webull", href: webullUrl(sym) },
    { id: "tos", label: "thinkorswim", href: thinkorswimUrl(sym) },
  ] as const;
}
