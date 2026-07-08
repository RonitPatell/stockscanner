/** Liquid US stocks — rotated for broad Finnhub company-news coverage */
export const ACTIVE_US_TICKERS = [
  "AAPL", "NVDA", "TSLA", "AMD", "MSFT", "META", "GOOGL", "GOOG", "AMZN", "MRNA",
  "PLTR", "SOFI", "RIVN", "COIN", "NFLX", "DIS", "BA", "JPM", "BAC", "XOM",
  "SMCI", "GME", "HOOD", "ARM", "AVGO", "INTC", "MU", "CRM", "UBER", "SNAP",
  "DKNG", "MARA", "RIOT", "MSTR", "PYPL", "SHOP", "ROKU", "ABNB", "LYFT",
  "CVNA", "UPST", "AFRM", "LCID", "NIO", "XPEV", "LI", "FSLR", "ENPH", "SEDG",
  "PFE", "JNJ", "UNH", "ABBV", "LLY", "BMY", "GILD", "REGN", "VRTX", "BIIB",
  "WMT", "TGT", "COST", "HD", "LOW", "NKE", "SBUX", "MCD", "KO", "PEP",
  "V", "MA", "GS", "MS", "C", "WFC", "SCHW", "BLK", "AXP", "COF",
  "ORCL", "ADBE", "NOW", "SNOW", "DDOG", "NET", "CRWD", "ZS", "PANW", "FTNT",
  "QCOM", "TXN", "AMAT", "LRCX", "KLAC", "MRVL", "SWKS", "QRVO", "MPWR",
  "F", "GM", "STLA", "RACE", "DE", "CAT", "GE", "RTX", "LMT", "NOC", "GD",
  "DAL", "UAL", "AAL", "LUV", "CCL", "RCL",
  "BABA", "JD", "PDD", "BIDU", "SE", "GRAB", "MELI", "NU", "VALE", "PBR",
  "CLSK", "HUT", "BITF", "BTBT", "SOUN", "BBAI", "PATH", "IONQ",
  "RGTI", "QBTS", "RKLB", "ASTS", "SPCE", "JOBY", "ACHR",
  "CHPT", "BLNK", "QS", "DNA", "TXG", "PACB", "CRSP", "NTLA", "BEAM",
  "AMC", "BB", "NOK", "TLRY", "CGC",
  "CLOV", "OPEN", "RDFN", "COMP", "RKT",
  "BKSY", "PL", "ALB", "LAC", "MP", "UUUU", "CCJ",
  "TSM", "ASML", "APP", "TTD", "MDB", "TEAM", "OKTA", "DOCU", "ZM", "SPOT",
  "BILI", "TME", "IQ", "HIMS", "OSCR", "RXRX", "SYM", "TEM", "FIG", "CRWV",
  "IOT", "S", "GTLB", "CFLT", "ESTC", "AI", "BILL", "TOST", "CELH", "ONON",
  "DUOL", "CAVA", "SHAK", "WING", "CMG", "ANET", "DELL", "HPE", "CSCO", "IBM",
  "T", "VZ", "TMUS", "CMCSA", "CHTR", "NEE", "DUK", "SO", "D", "SRE",
  "CVX", "COP", "OXY", "SLB", "HAL", "BKR", "EOG", "PXD",
  "SPY", "QQQ", "IWM", "DIA", "ARKK", "XLK", "XLF", "XLE", "XBI", "SOXX",
];

let pollCursor = 0;

export function getNextTickerBatch(batchSize = 22): string[] {
  const unique = [...new Set(ACTIVE_US_TICKERS)];
  const batch: string[] = [];
  for (let i = 0; i < batchSize && i < unique.length; i++) {
    batch.push(unique[(pollCursor + i) % unique.length]);
  }
  pollCursor = (pollCursor + batchSize) % unique.length;
  return batch;
}
