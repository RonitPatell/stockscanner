/** Client-side paper trade ledger — proves the loop: news → decision → outcome. */

export interface PaperTrade {
  id: string;
  catalystId: string;
  symbol: string;
  headline: string;
  side: "long" | "short";
  entryPrice: number;
  entryChangePercent: number | null;
  entryAt: string;
  notionalUsd: number;
  note?: string;
  /** Filled when user closes or we mark EOD */
  exitPrice?: number;
  exitAt?: string;
  pnlUsd?: number;
  pnlPercent?: number;
  status: "open" | "closed";
}

const KEY = "trustticker:paper-trades:v1";
const MAX = 50;

function read(): PaperTrade[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PaperTrade[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(trades: PaperTrade[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(trades.slice(0, MAX)));
}

export function listPaperTrades(): PaperTrade[] {
  return read().sort((a, b) => b.entryAt.localeCompare(a.entryAt));
}

export function openPaperTrade(input: {
  catalystId: string;
  symbol: string;
  headline: string;
  side: "long" | "short";
  entryPrice: number;
  entryChangePercent?: number | null;
  notionalUsd?: number;
  note?: string;
}): PaperTrade {
  const trade: PaperTrade = {
    id: `pt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    catalystId: input.catalystId,
    symbol: input.symbol.toUpperCase(),
    headline: input.headline,
    side: input.side,
    entryPrice: input.entryPrice,
    entryChangePercent: input.entryChangePercent ?? null,
    entryAt: new Date().toISOString(),
    notionalUsd: input.notionalUsd ?? 1000,
    note: input.note,
    status: "open",
  };
  const next = [trade, ...read().filter((t) => t.catalystId !== input.catalystId)];
  write(next);
  return trade;
}

export function closePaperTrade(id: string, exitPrice: number): PaperTrade | null {
  const trades = read();
  const idx = trades.findIndex((t) => t.id === id);
  if (idx < 0) return null;
  const t = trades[idx];
  if (t.status === "closed") return t;
  const dir = t.side === "long" ? 1 : -1;
  const pnlPercent = ((exitPrice - t.entryPrice) / t.entryPrice) * 100 * dir;
  const pnlUsd = Math.round((pnlPercent / 100) * t.notionalUsd * 100) / 100;
  const closed: PaperTrade = {
    ...t,
    status: "closed",
    exitPrice,
    exitAt: new Date().toISOString(),
    pnlPercent: Math.round(pnlPercent * 100) / 100,
    pnlUsd,
  };
  trades[idx] = closed;
  write(trades);
  return closed;
}

export function paperTradeStats(trades: PaperTrade[] = listPaperTrades()) {
  const closed = trades.filter((t) => t.status === "closed" && t.pnlUsd != null);
  const open = trades.filter((t) => t.status === "open");
  const totalPnl = closed.reduce((s, t) => s + (t.pnlUsd ?? 0), 0);
  const wins = closed.filter((t) => (t.pnlUsd ?? 0) > 0).length;
  return {
    openCount: open.length,
    closedCount: closed.length,
    totalPnlUsd: Math.round(totalPnl * 100) / 100,
    winRate: closed.length ? Math.round((wins / closed.length) * 1000) / 10 : null,
  };
}
