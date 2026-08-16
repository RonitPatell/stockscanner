/**
 * Monitored portfolio service — session userId only (callers pass DB user id).
 */

import { prisma } from "../prisma.ts";
import type { AddPortfolioBody, UpdatePortfolioBody } from "./schemas.ts";
import { normalizePortfolioSymbol } from "./symbols.ts";

export type PortfolioItemDto = {
  id: string;
  symbol: string;
  cik: string | null;
  kind: string;
  label: string | null;
  monitoredSince: string;
  entryPrice: number | null;
  notes: string | null;
  sortOrder: number;
  source: string;
  createdAt: string;
  updatedAt: string;
  companyName: string | null;
  quote: {
    price: number | null;
    changePercent: number | null;
    asOf: string | null;
  } | null;
};

function toDto(
  row: {
    id: string;
    symbol: string;
    cik: string | null;
    kind: string;
    label: string | null;
    monitoredSince: Date;
    costBasisPerShare: number | null;
    notes: string | null;
    sortOrder: number;
    source: string;
    createdAt: Date;
    updatedAt: Date;
  },
  extras?: {
    companyName?: string | null;
    quote?: PortfolioItemDto["quote"];
  }
): PortfolioItemDto {
  return {
    id: row.id,
    symbol: row.symbol,
    cik: row.cik,
    kind: row.kind,
    label: row.label,
    monitoredSince: row.monitoredSince.toISOString(),
    entryPrice: row.costBasisPerShare,
    notes: row.notes,
    sortOrder: row.sortOrder,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    companyName: extras?.companyName ?? null,
    quote: extras?.quote ?? null,
  };
}

async function syncWatchlistArray(userId: string): Promise<void> {
  const active = await prisma.portfolioItem.findMany({
    where: { userId, archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { symbol: true },
  });
  const watchlist = active.map((r) => r.symbol);
  await prisma.user.update({
    where: { id: userId },
    data: { watchlist },
  });
  try {
    const { syncWatchlistCoverage } = await import(
      "@/lib/coverage/coverage-service"
    );
    await syncWatchlistCoverage(watchlist);
  } catch {
    /* non-fatal */
  }
}

async function lookupCompanyMeta(symbol: string): Promise<{
  name: string | null;
  cik: string | null;
}> {
  try {
    const row = await prisma.symbolMaster.findUnique({
      where: { symbol },
      select: { name: true, cik: true },
    });
    return { name: row?.name ?? null, cik: row?.cik ?? null };
  } catch {
    return { name: null, cik: null };
  }
}

async function opportunisticQuotes(
  symbols: string[]
): Promise<
  Record<string, { price: number | null; changePercent: number | null; asOf: string | null }>
> {
  if (symbols.length === 0) return {};
  try {
    const { getCachedQuotes } = await import("@/lib/quote-cache-service");
    const quotes = await getCachedQuotes(symbols);
    const out: Record<
      string,
      { price: number | null; changePercent: number | null; asOf: string | null }
    > = {};
    for (const sym of symbols) {
      const q = quotes[sym];
      if (!q) continue;
      out[sym] = {
        price: typeof q.price === "number" ? q.price : null,
        changePercent:
          typeof q.changePercent === "number" ? q.changePercent : null,
        asOf: null,
      };
    }
    return out;
  } catch {
    return {};
  }
}

export async function listPortfolioForUser(
  userId: string
): Promise<PortfolioItemDto[]> {
  const rows = await prisma.portfolioItem.findMany({
    where: { userId, archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const symbols = rows.map((r) => r.symbol);
  const [quotes, masters] = await Promise.all([
    opportunisticQuotes(symbols),
    symbols.length
      ? prisma.symbolMaster.findMany({
          where: { symbol: { in: symbols } },
          select: { symbol: true, name: true },
        })
      : Promise.resolve([] as { symbol: string; name: string | null }[]),
  ]);
  const nameBySym = new Map(masters.map((m) => [m.symbol, m.name]));
  return rows.map((row) =>
    toDto(row, {
      companyName: nameBySym.get(row.symbol) ?? null,
      quote: quotes[row.symbol]
        ? {
            price: quotes[row.symbol]!.price,
            changePercent: quotes[row.symbol]!.changePercent,
            asOf: quotes[row.symbol]!.asOf,
          }
        : null,
    })
  );
}

export type PortfolioMutationResult =
  | { ok: true; item: PortfolioItemDto }
  | { ok: false; code: "DUPLICATE" | "NOT_FOUND" | "INVALID"; error: string };

export async function addPortfolioForUser(
  userId: string,
  body: AddPortfolioBody
): Promise<PortfolioMutationResult> {
  const symbol = normalizePortfolioSymbol(body.symbol);
  if (!symbol) {
    return { ok: false, code: "INVALID", error: "Invalid ticker symbol" };
  }
  const existing = await prisma.portfolioItem.findUnique({
    where: { userId_symbol: { userId, symbol } },
  });
  if (existing && !existing.archivedAt) {
    return {
      ok: false,
      code: "DUPLICATE",
      error: `${symbol} is already in your portfolio`,
    };
  }

  const meta = await lookupCompanyMeta(symbol);
  const notes = body.notes ?? body.note ?? null;
  const monitoredSince = body.monitoredSince ?? new Date();

  const count = await prisma.portfolioItem.count({
    where: { userId, archivedAt: null },
  });

  const row = existing
    ? await prisma.portfolioItem.update({
        where: { id: existing.id },
        data: {
          archivedAt: null,
          label: body.label ?? existing.label,
          notes: notes ?? existing.notes,
          costBasisPerShare:
            body.entryPrice !== undefined
              ? body.entryPrice
              : existing.costBasisPerShare,
          monitoredSince,
          kind: body.kind ?? existing.kind,
          cik: meta.cik ?? existing.cik,
          source: "api",
          sortOrder: count,
        },
      })
    : await prisma.portfolioItem.create({
        data: {
          userId,
          symbol,
          kind: body.kind ?? "watch",
          label: body.label ?? null,
          notes,
          costBasisPerShare: body.entryPrice ?? null,
          monitoredSince,
          cik: meta.cik,
          source: "api",
          sortOrder: count,
        },
      });

  await syncWatchlistArray(userId);
  return {
    ok: true,
    item: toDto(row, { companyName: meta.name }),
  };
}

export async function updatePortfolioForUser(
  userId: string,
  itemId: string,
  body: UpdatePortfolioBody
): Promise<PortfolioMutationResult> {
  const existing = await prisma.portfolioItem.findFirst({
    where: { id: itemId, userId, archivedAt: null },
  });
  if (!existing) {
    return { ok: false, code: "NOT_FOUND", error: "Portfolio item not found" };
  }

  const notes =
    body.notes !== undefined
      ? body.notes
      : body.note !== undefined
        ? body.note
        : undefined;

  const row = await prisma.portfolioItem.update({
    where: { id: existing.id },
    data: {
      ...(body.label !== undefined ? { label: body.label } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(body.entryPrice !== undefined
        ? { costBasisPerShare: body.entryPrice }
        : {}),
      ...(body.monitoredSince
        ? { monitoredSince: body.monitoredSince }
        : {}),
      ...(body.kind !== undefined ? { kind: body.kind } : {}),
    },
  });

  return { ok: true, item: toDto(row) };
}

export async function removePortfolioForUser(
  userId: string,
  itemId: string
): Promise<
  | { ok: true; removed: true; symbol: string }
  | { ok: false; code: "NOT_FOUND"; error: string }
> {
  const existing = await prisma.portfolioItem.findFirst({
    where: { id: itemId, userId },
  });
  if (!existing || existing.archivedAt) {
    return { ok: false, code: "NOT_FOUND", error: "Portfolio item not found" };
  }

  await prisma.portfolioItem.delete({ where: { id: existing.id } });
  await syncWatchlistArray(userId);
  return { ok: true, removed: true, symbol: existing.symbol };
}

export async function searchCompaniesForPortfolio(opts: {
  q: string;
  limit: number;
}): Promise<{ symbol: string; name: string | null; exchange: string | null }[]> {
  const q = opts.q.trim();
  const asSymbol = normalizePortfolioSymbol(q);
  const limit = opts.limit;

  try {
    const rows = await prisma.symbolMaster.findMany({
      where: {
        isActive: true,
        OR: [
          ...(asSymbol
            ? [{ symbol: { startsWith: asSymbol } }]
            : [{ symbol: { startsWith: q.toUpperCase().slice(0, 5) } }]),
          {
            name: {
              contains: q,
              mode: "insensitive",
            },
          },
        ],
      },
      orderBy: { symbol: "asc" },
      take: limit,
      select: { symbol: true, name: true, exchange: true },
    });
    return rows;
  } catch {
    // SymbolMaster may be empty / unavailable — still allow typed tickers.
    if (asSymbol) {
      return [{ symbol: asSymbol, name: null, exchange: null }];
    }
    return [];
  }
}
