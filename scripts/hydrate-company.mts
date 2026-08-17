/**
 * Local / operator company hydration — SAME domain services as production cron.
 *
 *   npm run hydrate -- RKLB
 *   npm run hydrate:portfolio
 */
import { prisma } from "../src/lib/prisma.ts";
import {
  hydrateCompanySymbol,
  productionHydratePorts,
} from "../src/lib/company-readiness/index.ts";
import { normalizeSymbol, isUsTickerSymbol } from "../src/lib/company-identity/index.ts";

function label(status: string): string {
  switch (status) {
    case "READY":
      return "populated";
    case "MISSING":
      return "unavailable";
    case "UNSUPPORTED":
      return "unsupported";
    case "ERROR":
      return "error";
    case "PROCESSING":
      return "processing";
    case "STALE":
      return "stale";
    default:
      return status.toLowerCase();
  }
}

function printResult(result: {
  symbol: string;
  identity: string;
  financials: string;
  capital: string;
  filings: string;
  insiders: string;
  ownership: string;
  institutional13F: string;
  errors: string[];
}): void {
  console.log(`\n${result.symbol}`);
  console.log(`Identity: ${result.identity === "READY" ? "ready" : result.identity.toLowerCase()}`);
  console.log(`Financials: ${label(result.financials)}`);
  console.log(`Filings: ${label(result.filings)}`);
  console.log(`Capital: ${label(result.capital)}`);
  console.log(`Insiders: ${label(result.insiders)}`);
  console.log(`Ownership: ${label(result.ownership)}`);
  console.log(`13F: skipped or queued`);
  if (result.errors.length) {
    console.log(`Errors: ${result.errors.join("; ")}`);
  }
}

async function hydrateOne(raw: string): Promise<number> {
  const symbol = normalizeSymbol(raw);
  if (!symbol || !isUsTickerSymbol(symbol)) {
    console.error(`Invalid ticker: ${raw}`);
    return 1;
  }
  try {
    const result = await hydrateCompanySymbol(symbol, productionHydratePorts());
    printResult(result);
    if (result.identity !== "READY") {
      console.error("CIK/identity is not ready — SEC datasets cannot hydrate.");
      return 2;
    }
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "hydration_failed";
    console.error(msg.replace(/postgres:\/\/\S+/gi, "[redacted]"));
    return 1;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const portfolio = args.includes("--portfolio");
  const symbols = args.filter((a) => a !== "--portfolio");

  if (portfolio) {
    const rows = await prisma.portfolioItem.findMany({
      where: { archivedAt: null },
      distinct: ["symbol"],
      take: 25,
      select: { symbol: true },
    });
    let code = 0;
    for (const row of rows) {
      const c = await hydrateOne(row.symbol);
      if (c !== 0) code = c;
    }
    if (rows.length === 0) console.log("No portfolio symbols to hydrate.");
    process.exit(code);
  }

  const symbol = symbols[0];
  if (!symbol) {
    console.error("Usage: npm run hydrate -- RKLB");
    console.error("       npm run hydrate:portfolio");
    process.exit(1);
  }
  process.exit(await hydrateOne(symbol));
}

void main();
