import { prisma } from "../prisma.ts";
import { SEC_USER_AGENT } from "../ingest/sec-politeness.ts";
import { ACTIVE_US_TICKERS } from "../news-sources/active-tickers.ts";
import { isValidTickerFormat } from "../ticker-utils.ts";
import { classifyAssetType, KNOWN_ETF_SYMBOLS } from "./asset-type.ts";

export { classifyAssetType, KNOWN_ETF_SYMBOLS } from "./asset-type.ts";

/**
 * Refresh SymbolMaster from SEC company_tickers.json (US listed issuers).
 * Does NOT claim real-time quote coverage for every row.
 */
export async function refreshSymbolMaster(): Promise<{
  upserted: number;
  etfs: number;
  equities: number;
}> {
  const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
    headers: { "User-Agent": SEC_USER_AGENT },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`SEC company_tickers HTTP ${res.status}`);
  }

  const data = (await res.json()) as Record<
    string,
    { cik_str: number; ticker: string; title?: string }
  >;

  const now = new Date();
  let upserted = 0;
  let etfs = 0;
  let equities = 0;
  const seen = new Set<string>();

  const rows: {
    symbol: string;
    name: string | null;
    cik: string;
    assetType: "equity" | "etf";
  }[] = [];

  for (const entry of Object.values(data)) {
    const symbol = String(entry.ticker ?? "")
      .trim()
      .toUpperCase()
      .replace(/\./g, "");
    if (!isValidTickerFormat(symbol) || seen.has(symbol)) continue;
    seen.add(symbol);
    const name = entry.title?.trim() || null;
    const assetType = classifyAssetType(symbol, name);
    if (assetType === "etf") etfs++;
    else equities++;
    rows.push({
      symbol,
      name,
      cik: String(entry.cik_str).padStart(10, "0"),
      assetType,
    });
  }

  // Ensure curated core + known ETFs exist even if missing from SEC map
  for (const sym of [...ACTIVE_US_TICKERS, ...KNOWN_ETF_SYMBOLS]) {
    if (seen.has(sym)) continue;
    if (!isValidTickerFormat(sym)) continue;
    seen.add(sym);
    const assetType = classifyAssetType(sym, null);
    if (assetType === "etf") etfs++;
    else equities++;
    rows.push({ symbol: sym, name: null, cik: "", assetType });
  }

  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    await Promise.all(
      chunk.map((row) =>
        prisma.symbolMaster
          .upsert({
            where: { symbol: row.symbol },
            create: {
              symbol: row.symbol,
              name: row.name,
              cik: row.cik || null,
              assetType: row.assetType,
              exchange: null,
              isActive: true,
              refreshedAt: now,
            },
            update: {
              name: row.name ?? undefined,
              cik: row.cik || undefined,
              assetType: row.assetType,
              isActive: true,
              refreshedAt: now,
            },
          })
          .then(() => {
            upserted++;
          })
          .catch(() => {})
      )
    );
  }

  // Soft-deactivate symbols not refreshed in this run (older than 36h)
  const staleBefore = new Date(Date.now() - 36 * 3600_000);
  await prisma.symbolMaster
    .updateMany({
      where: { refreshedAt: { lt: staleBefore }, isActive: true },
      data: { isActive: false },
    })
    .catch(() => {});

  return { upserted, etfs, equities };
}

export async function isListedSymbol(symbol: string): Promise<boolean> {
  const sym = symbol.toUpperCase();
  const row = await prisma.symbolMaster.findUnique({
    where: { symbol: sym },
    select: { isActive: true },
  });
  if (row?.isActive) return true;
  // Fallback before first daily refresh
  return ACTIVE_US_TICKERS.includes(sym) || KNOWN_ETF_SYMBOLS.has(sym);
}

export async function getSymbolMasterMeta(symbol: string): Promise<{
  name: string | null;
  assetType: string;
  listed: boolean;
} | null> {
  const row = await prisma.symbolMaster.findUnique({
    where: { symbol: symbol.toUpperCase() },
    select: { name: true, assetType: true, isActive: true },
  });
  if (!row) return null;
  return { name: row.name, assetType: row.assetType, listed: row.isActive };
}
