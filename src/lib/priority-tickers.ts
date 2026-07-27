import { prisma } from "./prisma";
import { getPriorityTickers as getWatchlistPriority } from "./priority-tickers-core";
import { getActiveCoverageSymbols } from "./coverage/coverage-service";

/**
 * Priority poll set = liquid always + watchlists + active dynamic coverage.
 * Cap keeps Finnhub company-news calls bounded.
 */
export async function getPriorityTickers(): Promise<string[]> {
  const [base, coverage] = await Promise.all([
    getWatchlistPriority(),
    getActiveCoverageSymbols(120).catch(() => [] as string[]),
  ]);
  const set = new Set<string>([...base, ...coverage.map((s) => s.toUpperCase())]);
  return [...set].slice(0, 100);
}
