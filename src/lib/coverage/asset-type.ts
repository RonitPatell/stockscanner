/** Well-known US-listed ETFs we can classify without pretending SEC tags every ETF. */
export const KNOWN_ETF_SYMBOLS = new Set([
  "SPY", "QQQ", "IWM", "DIA", "VTI", "VOO", "VEA", "VWO", "EFA", "EEM",
  "ARKK", "ARKG", "ARKW", "XLK", "XLF", "XLE", "XLV", "XLI", "XLB", "XLU",
  "XLP", "XLY", "XBI", "SOXX", "SMH", "UNG", "GLD", "SLV", "TLT", "HYG",
  "LQD", "JNK", "XOP", "KRE", "XRT", "IBB", "LABU", "TQQQ", "SQQQ", "UVXY",
  "VXX", "SPXU", "SPXL", "UPRO", "TNA", "TZA", "FAS", "FAZ", "JNUG", "JDST",
]);

export function classifyAssetType(symbol: string, name?: string | null): "equity" | "etf" {
  const sym = symbol.toUpperCase();
  if (KNOWN_ETF_SYMBOLS.has(sym)) return "etf";
  const n = (name ?? "").toLowerCase();
  if (
    /\betf\b|exchange[\s-]?traded|trust\b.*shares|proshares|direxion|ishares|spdr\b|vanguard\b/.test(
      n
    )
  ) {
    return "etf";
  }
  return "equity";
}
