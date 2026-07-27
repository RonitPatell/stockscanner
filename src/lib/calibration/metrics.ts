import type { HorizonMetrics, OutcomeHorizon, PriceSnapshot } from "./types.ts";
import {
  computeExcursions,
  rawReturnPct,
  relativeReturnPct,
  type CandleSet,
} from "./candles.ts";

const INVALID_QUALITIES = new Set([
  "MISSING",
  "INVALID",
  "HALTED",
  "SPLIT_ADJUST_SUSPECT",
  "GAP_EXTREME",
  "STALE",
]);

export function snapshotUsable(s: PriceSnapshot | null | undefined): boolean {
  if (!s || s.price == null || !(s.price > 0)) return false;
  if (INVALID_QUALITIES.has(s.quality) && s.quality !== "STALE") return false;
  // STALE allowed only if explicitly noted — default exclude from primary metrics
  if (s.quality === "STALE") return false;
  if (s.quality === "SPLIT_ADJUST_SUSPECT" || s.quality === "GAP_EXTREME") return false;
  return true;
}

export function computeHorizonMetrics(opts: {
  horizon: OutcomeHorizon;
  entry: PriceSnapshot | null;
  exit: PriceSnapshot | null;
  spyEntry: PriceSnapshot | null;
  spyExit: PriceSnapshot | null;
  sectorEntry: PriceSnapshot | null;
  sectorExit: PriceSnapshot | null;
  candles?: CandleSet | null;
  ingestSec?: number;
  exitSec?: number;
}): HorizonMetrics {
  const { horizon, entry, exit } = opts;

  if (!snapshotUsable(entry)) {
    return {
      horizon,
      rawReturnPct: null,
      spyRelativePct: null,
      sectorRelativePct: null,
      mfePct: null,
      maePct: null,
      volumeChangePct: null,
      spreadPct: exit?.spreadPct ?? entry?.spreadPct ?? null,
      sampleValid: false,
      invalidReason: entry?.quality === "STALE" ? "stale_entry" : "missing_entry",
    };
  }

  if (!snapshotUsable(exit)) {
    return {
      horizon,
      rawReturnPct: null,
      spyRelativePct: null,
      sectorRelativePct: null,
      mfePct: null,
      maePct: null,
      volumeChangePct: null,
      spreadPct: exit?.spreadPct ?? entry?.spreadPct ?? null,
      sampleValid: false,
      invalidReason:
        exit?.quality === "HALTED"
          ? "halted"
          : exit?.quality === "SPLIT_ADJUST_SUSPECT"
            ? "split_suspect"
            : exit?.quality === "GAP_EXTREME"
              ? "extreme_gap"
              : exit?.substituted && exit.quality === "MISSING"
                ? "missing_candle"
                : "missing_exit",
    };
  }

  const raw = rawReturnPct(entry!.price, exit!.price);
  const spyRaw =
    snapshotUsable(opts.spyEntry) && snapshotUsable(opts.spyExit)
      ? rawReturnPct(opts.spyEntry!.price, opts.spyExit!.price)
      : null;
  const sectorRaw =
    snapshotUsable(opts.sectorEntry) && snapshotUsable(opts.sectorExit)
      ? rawReturnPct(opts.sectorEntry!.price, opts.sectorExit!.price)
      : null;

  let mfePct: number | null = null;
  let maePct: number | null = null;
  if (opts.candles && opts.ingestSec != null && opts.exitSec != null && entry!.price) {
    const ex = computeExcursions(opts.candles, entry!.price, opts.ingestSec, opts.exitSec);
    mfePct = ex.mfePct;
    maePct = ex.maePct;
  }

  let volumeChangePct: number | null = null;
  if (entry!.volume != null && exit!.volume != null && entry!.volume > 0) {
    volumeChangePct =
      Math.round(((exit!.volume - entry!.volume) / entry!.volume) * 10000) / 100;
  }

  return {
    horizon,
    rawReturnPct: raw,
    spyRelativePct: relativeReturnPct(raw, spyRaw),
    sectorRelativePct: relativeReturnPct(raw, sectorRaw),
    mfePct,
    maePct,
    volumeChangePct,
    spreadPct: exit!.spreadPct ?? entry!.spreadPct ?? null,
    sampleValid: raw != null,
  };
}

/** Simple sector ETF proxy — unknown → null (never invent). */
const SYMBOL_SECTOR: Record<string, string> = {
  // Sparse seed; expand via SymbolMaster later
};

export function sectorEtfForSymbol(symbol: string): string | null {
  return SYMBOL_SECTOR[symbol.toUpperCase()] ?? null;
}

export const BENCHMARK_SPY = "SPY";
