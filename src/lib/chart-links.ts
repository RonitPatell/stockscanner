/** TradingView chart deep link for US equities */
export function tradingViewUrl(symbol: string): string {
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(`NASDAQ:${symbol}`)}`;
}

export function finvizUrl(symbol: string): string {
  return `https://finviz.com/quote.ashx?t=${encodeURIComponent(symbol)}`;
}
