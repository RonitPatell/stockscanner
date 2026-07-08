// Words that look like tickers in headlines but are not stock symbols
export const TICKER_BLACKLIST = new Set([
  "AI", "AM", "AN", "API", "ARC", "ARE", "AT", "BE", "BIG", "CEO", "CFO", "CNBC", "CO",
  "CPI", "DO", "EPS", "ET", "EU", "FDA", "FOR", "FTC", "FTSE", "GDP", "GO", "GOP",
  "IDB", "IN", "IPO", "IR", "IT", "MSA", "NATO", "NEW", "NYSE", "ON", "OR", "OTC", "PDF",
  "PLC", "PM", "REIT", "RSS", "SEC", "STB", "THE", "TO", "TV", "UK", "UN", "UP", "US",
  "USA", "UTC", "WSJ", "FIFA", "ALL", "AND", "BUT", "CAN", "DAY", "GET", "HAS", "HIS",
  "HOW", "ITS", "MAY", "NOW", "OLD", "ONE", "OUR", "OUT", "OWN", "SAY", "SHE", "TOO",
  "TWO", "USE", "WAY", "WHO", "WHY", "YET", "YOU", "TOP", "LOW", "HIGH", "BUY", "SELL",
  "RED", "BLUE", "HOT", "BIG", "FED", "ECB", "BOJ", "IMF", "OPEC", "WTO", "UAE", "LNG",
  "III", "CORP", "INC", "LTD", "LLC", "ETF", "PMI", "NV", "MS", "PR",
  "IRS", "FBI", "CIA", "DHS", "CDC", "WHO", "DOW", "VIX",
]);

export function isValidTickerFormat(symbol: string): boolean {
  return /^[A-Z]{1,5}$/.test(symbol) && !TICKER_BLACKLIST.has(symbol);
}

/** Only accept tickers explicitly named in the headline */
export function extractSymbolFromHeadline(headline: string): string {
  const exchangeMatch = headline.match(/\((?:NASDAQ|NYSE|AMEX|OTC)[:\s]+([A-Z]{1,5})\)/i);
  if (exchangeMatch?.[1]) {
    const sym = exchangeMatch[1].toUpperCase();
    if (isValidTickerFormat(sym)) return sym;
  }

  const dollarMatch = headline.match(/\$([A-Z]{1,5})\b/);
  if (dollarMatch?.[1] && isValidTickerFormat(dollarMatch[1])) return dollarMatch[1];

  const startMatch = headline.match(/^([A-Z]{3,5})\b/);
  if (startMatch?.[1] && isValidTickerFormat(startMatch[1])) return startMatch[1];

  return "";
}
