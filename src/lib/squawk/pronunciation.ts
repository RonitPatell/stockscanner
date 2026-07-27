/** Pronunciation dictionary for tickers and common abbreviations. */

const TICKER_SAY: Record<string, string> = {
  AAPL: "Apple",
  MSFT: "Microsoft",
  NVDA: "Nvidia",
  AMD: "A M D",
  TSLA: "Tesla",
  META: "Meta",
  GOOGL: "Google",
  GOOG: "Google",
  AMZN: "Amazon",
  NFLX: "Netflix",
  SOFI: "So-Fi",
  PLTR: "Palantir",
  SMCI: "S M C I",
  IREN: "Iris Energy",
  MARA: "Marathon",
  RIOT: "Riot",
  COIN: "Coinbase",
};

const ABBREV: Record<string, string> = {
  FDA: "F D A",
  SEC: "S E C",
  EPS: "E P S",
  ATM: "A T M",
  RVol: "relative volume",
  RVOL: "relative volume",
  HOD: "high of day",
  VWAP: "V Wap",
  LULD: "L U L D",
  ETF: "E T F",
  IPO: "I P O",
  NDA: "N D A",
  PDUFA: "P D U F A",
};

export function pronounceSymbol(symbol: string): string {
  const u = symbol.toUpperCase();
  if (TICKER_SAY[u]) return TICKER_SAY[u]!;
  // Spell short tickers letter-by-letter for clarity
  if (u.length <= 4 && /^[A-Z]+$/.test(u)) {
    return u.split("").join(" ");
  }
  return u;
}

export function applyPronunciationDictionary(text: string): string {
  let out = text;
  for (const [k, v] of Object.entries(ABBREV)) {
    out = out.replace(new RegExp(`\\b${k}\\b`, "g"), v);
  }
  // $TICKER → spoken
  out = out.replace(/\$([A-Z]{1,5})\b/g, (_, sym: string) =>
    pronounceSymbol(sym)
  );
  return out;
}

export function getPronunciationDictionary(): {
  tickers: Record<string, string>;
  abbreviations: Record<string, string>;
} {
  return { tickers: { ...TICKER_SAY }, abbreviations: { ...ABBREV } };
}
