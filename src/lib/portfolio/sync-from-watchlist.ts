/**
 * Expand-contract: keep User.watchlist[] as the legacy source of truth for
 * existing settings UI while backfilling / syncing relational PortfolioItem rows.
 *
 * Does not delete PortfolioItem rows that are not in watchlist (may be holdings
 * with richer metadata). Only upserts symbols present on the watchlist.
 */

import { prisma } from "@/lib/prisma";
import { normalizePortfolioSymbol } from "./symbols";

export { normalizePortfolioSymbol } from "./symbols";

export async function syncPortfolioItemsFromWatchlist(opts: {
  userId: string;
  watchlist: string[];
  source?: string;
}): Promise<{ upserted: number; symbols: string[] }> {
  const symbols = [
    ...new Set(
      opts.watchlist
        .map(normalizePortfolioSymbol)
        .filter((s): s is string => Boolean(s))
    ),
  ];
  if (symbols.length === 0) {
    return { upserted: 0, symbols: [] };
  }

  const source = opts.source ?? "watchlist_migration";
  let upserted = 0;

  for (let index = 0; index < symbols.length; index++) {
    const symbol = symbols[index]!;
    await prisma.portfolioItem.upsert({
      where: {
        userId_symbol: { userId: opts.userId, symbol },
      },
      create: {
        userId: opts.userId,
        symbol,
        kind: "watch",
        sortOrder: index,
        source,
        archivedAt: null,
      },
      update: {
        archivedAt: null,
        // Do not clobber shares / cost basis / notes on re-sync.
        sortOrder: index,
      },
    });
    upserted += 1;
  }

  return { upserted, symbols };
}

/**
 * One-shot backfill for all users that still only have watchlist[] data.
 * Safe to re-run (upsert + unique userId+symbol).
 */
export async function backfillPortfolioItemsFromWatchlists(opts?: {
  batchSize?: number;
}): Promise<{ users: number; items: number }> {
  const batchSize = opts?.batchSize ?? 200;
  let users = 0;
  let items = 0;
  let cursor: string | undefined;

  for (;;) {
    const batch = await prisma.user.findMany({
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: { id: true, watchlist: true },
    });
    if (batch.length === 0) break;

    for (const u of batch) {
      if (!u.watchlist?.length) continue;
      const r = await syncPortfolioItemsFromWatchlist({
        userId: u.id,
        watchlist: u.watchlist,
        source: "watchlist_migration",
      });
      users += 1;
      items += r.upserted;
    }

    cursor = batch[batch.length - 1]!.id;
    if (batch.length < batchSize) break;
  }

  return { users, items };
}
