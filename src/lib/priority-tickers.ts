import { prisma } from "./prisma";

/** Always polled — major names traders expect near-instant coverage for */
const LIQUID_ALWAYS = [
  "NVDA", "TSLA", "AMD", "AAPL", "MSFT", "META", "AMZN", "GOOGL", "CRM", "ORCL",
];

let cache: { symbols: string[]; ts: number } = { symbols: [...LIQUID_ALWAYS], ts: 0 };

export async function getPriorityTickers(): Promise<string[]> {
  if (Date.now() - cache.ts < 60_000) return cache.symbols;
  try {
    const users = await prisma.user.findMany({
      select: { watchlist: true },
      take: 500,
    });
    const set = new Set<string>([
      ...LIQUID_ALWAYS,
      ...users.flatMap((u) => u.watchlist.map((s) => s.toUpperCase())),
    ]);
    cache = { symbols: [...set].slice(0, 80), ts: Date.now() };
  } catch {
    cache = { symbols: [...LIQUID_ALWAYS], ts: Date.now() };
  }
  return cache.symbols;
}
