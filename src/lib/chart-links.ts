/** Deep links into charts / brokers for US equities */
export function tradingViewUrl(symbol: string): string {
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(`NASDAQ:${symbol}`)}`;
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
