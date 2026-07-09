import type {
  MarketAlert,
  MarketAlertType,
  MarketScannerSnapshot,
  StockQuote,
  VolumeLeader,
} from "@/types";
import { fetchQuoteTrusted, fetchVolumeForSymbol } from "./market-data";
import { seedCachedQuote } from "./quote-cache-service";
import { isValidTickerFormat } from "./ticker-utils";
import { isKnownFalsePositive } from "./news-verifier";
import { getNextTickerBatch } from "./news-sources/active-tickers";

const MAX_LIVE_QUOTES = 3;
const MAX_CANDLE_LOOKUPS = 4;
const VOLUME_LEADERS_SHOWN = 10;
const SCAN_CACHE_MS = 60_000;
const ALERT_COOLDOWN_MS = 3 * 60 * 1000;
const MAX_ALERTS = 80;

interface SymbolTrack {
  touchedHod: boolean;
  dippedFromHod: boolean;
  lastHigh: number;
}

export interface CatalystScanHint {
  symbol: string;
  price: number | null;
  changePercent: number | null;
  volume?: number | null;
  avgVolume?: number | null;
  headline?: string;
  publishedAt?: Date | string;
}

const symbolTracks = new Map<string, SymbolTrack>();
const alertCooldowns = new Map<string, number>();
let alertFeed: MarketAlert[] = [];
let cachedSnapshot: MarketScannerSnapshot | null = null;
let lastScanAt = 0;
let scanInFlight: Promise<MarketScannerSnapshot> | null = null;

export function getMarketSession(): MarketScannerSnapshot["marketSession"] {
  const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay();
  if (day === 0 || day === 6) return "closed";
  const mins = et.getHours() * 60 + et.getMinutes();
  if (mins >= 240 && mins < 570) return "premarket";
  if (mins >= 570 && mins < 960) return "regular";
  if (mins >= 960 && mins < 1200) return "afterhours";
  return "closed";
}

function sessionVolumeFactor(): number {
  const session = getMarketSession();
  if (session === "premarket") return 0.15;
  if (session === "afterhours") return 0.1;
  if (session === "closed") return 0.35;
  const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const mins = et.getHours() * 60 + et.getMinutes();
  const sessionStart = 9 * 60 + 30;
  const sessionEnd = 16 * 60;
  const elapsed = Math.max(15, mins - sessionStart);
  const total = sessionEnd - sessionStart;
  return Math.min(0.95, Math.max(0.2, elapsed / total));
}

function canAlert(symbol: string, type: MarketAlertType): boolean {
  const key = `${symbol}:${type}`;
  const last = alertCooldowns.get(key) ?? 0;
  if (Date.now() - last < ALERT_COOLDOWN_MS) return false;
  alertCooldowns.set(key, Date.now());
  return true;
}

function pushAlert(alert: Omit<MarketAlert, "id" | "timestamp">) {
  if (!canAlert(alert.symbol, alert.type)) return;
  alertFeed.unshift({
    ...alert,
    id: `${alert.symbol}-${alert.type}-${Date.now()}`,
    timestamp: new Date().toISOString(),
  });
  alertFeed = alertFeed.slice(0, MAX_ALERTS);
}

function detectAlerts(quote: StockQuote, rVol: number) {
  const price = quote.price;
  const dayHigh = quote.dayHigh ?? price;
  const change = quote.changePercent;
  const nearHod = dayHigh > 0 && price >= dayHigh * 0.995;
  const atHod = dayHigh > 0 && price >= dayHigh * 0.998;

  let track = symbolTracks.get(quote.symbol);
  if (!track) {
    track = { touchedHod: false, dippedFromHod: false, lastHigh: dayHigh };
    symbolTracks.set(quote.symbol, track);
  }

  if (atHod && change > 0) {
    pushAlert({
      symbol: quote.symbol,
      type: "hod",
      message: `High of day — +${change.toFixed(1)}%`,
      changePercent: change,
      price,
      rVol: rVol > 0 ? rVol : undefined,
    });
    track.touchedHod = true;
  } else if (nearHod && change > 1) {
    pushAlert({
      symbol: quote.symbol,
      type: "near_hod",
      message: `Near HOD — +${change.toFixed(1)}% today`,
      changePercent: change,
      price,
      rVol: rVol > 0 ? rVol : undefined,
    });
    track.touchedHod = true;
  }

  if (track.touchedHod && price < dayHigh * 0.985) {
    track.dippedFromHod = true;
  }

  if (track.dippedFromHod && nearHod && change > 0) {
    pushAlert({
      symbol: quote.symbol,
      type: "hod_retest",
      message: `HOD retest — reclaiming $${dayHigh.toFixed(2)}`,
      changePercent: change,
      price,
      rVol: rVol > 0 ? rVol : undefined,
    });
    track.dippedFromHod = false;
  }

  track.lastHigh = dayHigh;

  if (rVol >= 2) {
    pushAlert({
      symbol: quote.symbol,
      type: "volume_surge",
      message: `Heavy volume — ${rVol.toFixed(1)}× avg`,
      changePercent: change,
      price,
      rVol,
    });
  }

  if (change >= 5) {
    pushAlert({
      symbol: quote.symbol,
      type: "momentum",
      message: `Momentum — up ${change.toFixed(1)}% today`,
      changePercent: change,
      price,
      rVol: rVol > 0 ? rVol : undefined,
    });
  } else if (change <= -5) {
    pushAlert({
      symbol: quote.symbol,
      type: "momentum",
      message: `Selling pressure — ${change.toFixed(1)}% today`,
      changePercent: change,
      price,
      rVol: rVol > 0 ? rVol : undefined,
    });
  }
}

function buildVolumeLeader(
  quote: StockQuote,
  volume: number,
  avgVolume: number,
  rVol: number
): VolumeLeader {
  const dayHigh = quote.dayHigh ?? quote.price;
  return {
    symbol: quote.symbol,
    price: quote.price,
    changePercent: quote.changePercent,
    volume,
    avgVolume,
    rVol,
    dayHigh,
    nearHod: dayHigh > 0 && quote.price >= dayHigh * 0.995,
    marketCap: quote.marketCap,
  };
}

/** One row per symbol — keep highest RVol */
function dedupeVolumeLeaders(leaders: VolumeLeader[]): VolumeLeader[] {
  const bySymbol = new Map<string, VolumeLeader>();
  for (const leader of leaders) {
    const existing = bySymbol.get(leader.symbol);
    if (!existing || leader.rVol > existing.rVol) {
      bySymbol.set(leader.symbol, leader);
    }
  }
  return [...bySymbol.values()].sort((a, b) => {
    if (b.rVol !== a.rVol) return b.rVol - a.rVol;
    return Math.abs(b.changePercent) - Math.abs(a.changePercent);
  });
}

function dedupeHints(hints: CatalystScanHint[]): CatalystScanHint[] {
  const bySymbol = new Map<string, CatalystScanHint>();
  for (const hint of hints) {
    const existing = bySymbol.get(hint.symbol);
    if (
      !existing ||
      Math.abs(hint.changePercent ?? 0) > Math.abs(existing.changePercent ?? 0)
    ) {
      bySymbol.set(hint.symbol, hint);
    }
  }
  return [...bySymbol.values()];
}

function hintToQuote(hint: CatalystScanHint): StockQuote | null {
  if (hint.price == null || hint.changePercent == null) return null;
  return {
    symbol: hint.symbol,
    price: hint.price,
    change: 0,
    changePercent: hint.changePercent,
    volume: 0,
  };
}

function seedAlertsFromCatalysts(hints: CatalystScanHint[]) {
  const seen = new Set<string>();
  for (const hint of hints) {
    if (!hint.headline || !hint.publishedAt || hint.changePercent == null) continue;
    if (!isValidTickerFormat(hint.symbol)) continue;
    if (isKnownFalsePositive(hint.symbol, hint.headline)) continue;
    const age = Date.now() - new Date(hint.publishedAt).getTime();
    if (age > 4 * 3_600_000) continue;
    if (Math.abs(hint.changePercent) < 2 && age > 60 * 60_000) continue;
    const key = `${hint.symbol}:${hint.headline.slice(0, 40)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    pushAlert({
      symbol: hint.symbol,
      type: "momentum",
      message: hint.headline.length > 72 ? `${hint.headline.slice(0, 72)}…` : hint.headline,
      changePercent: hint.changePercent,
      price: hint.price ?? 0,
    });
  }
}

function getDemoSnapshot(): MarketScannerSnapshot {
  const now = Date.now();
  return {
    scannedAt: new Date().toISOString(),
    marketSession: getMarketSession(),
    volumeLeaders: [
      { symbol: "BJDX", price: 1.54, changePercent: 33.45, volume: 48_000_000, avgVolume: 4_500_000, rVol: 10.6, dayHigh: 1.58, nearHod: true },
      { symbol: "GCTK", price: 0.42, changePercent: 18.2, volume: 22_000_000, avgVolume: 3_100_000, rVol: 7.1, dayHigh: 0.44, nearHod: false },
      { symbol: "NVDA", price: 142.5, changePercent: 4.8, volume: 85_000_000, avgVolume: 52_000_000, rVol: 1.6, dayHigh: 143.2, nearHod: true },
    ],
    alerts: [
      { id: "1", symbol: "BJDX", type: "hod", message: "High of day — +33.5%", changePercent: 33.45, price: 1.54, rVol: 10.6, timestamp: new Date(now - 30_000).toISOString() },
      { id: "2", symbol: "GCTK", type: "momentum", message: "Momentum — up 18.2% today", changePercent: 18.2, price: 0.42, rVol: 7.1, timestamp: new Date(now - 90_000).toISOString() },
    ],
  };
}

function buildQuickSnapshot(hints: CatalystScanHint[]): MarketScannerSnapshot {
  seedAlertsFromCatalysts(hints);
  const factor = sessionVolumeFactor();
  const uniqueHints = dedupeHints(hints);

  const volumeLeaders = dedupeVolumeLeaders(
    uniqueHints
      .filter((h) => h.price != null && h.changePercent != null)
      .sort((a, b) => Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0))
      .slice(0, VOLUME_LEADERS_SHOWN)
      .map((h) => {
        const volume = h.volume ?? 0;
        const avgVolume = h.avgVolume && h.avgVolume > 0 ? h.avgVolume : Math.max(volume, 1);
        const expected = avgVolume * factor;
        const rVol = volume > 0 && expected > 0 ? volume / expected : Math.abs(h.changePercent ?? 0) / 8;
        const quote = hintToQuote(h)!;
        return buildVolumeLeader(quote, volume, avgVolume, rVol);
      })
  );

  return {
    alerts: alertFeed,
    volumeLeaders,
    scannedAt: new Date().toISOString(),
    marketSession: getMarketSession(),
  };
}

async function runFullScan(
  extraSymbols: string[],
  catalystHints: CatalystScanHint[]
): Promise<MarketScannerSnapshot> {
  const hints = dedupeHints(catalystHints);
  seedAlertsFromCatalysts(hints);

  const quoteMap = new Map<string, StockQuote>();

  const topMovers = [...hints]
    .filter((h) => h.price != null && h.changePercent != null)
    .sort((a, b) => Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0))
    .slice(0, 3);

  let liveFetches = 0;
  for (const hint of topMovers) {
    const q = await fetchQuoteTrusted(hint.symbol);
    liveFetches++;
    if (q) quoteMap.set(hint.symbol, q);
    else {
      const fallback = hintToQuote(hint);
      if (fallback) quoteMap.set(hint.symbol, fallback);
    }
  }

  for (const hint of hints) {
    if (quoteMap.has(hint.symbol)) continue;
    const q = hintToQuote(hint);
    if (q) quoteMap.set(hint.symbol, q);
  }

  const symbolOrder = [
    ...new Set([
      ...hints.map((h) => h.symbol),
      ...extraSymbols,
      ...getNextTickerBatch(3),
    ]),
  ];

  for (const symbol of symbolOrder) {
    if (quoteMap.has(symbol)) continue;
    if (liveFetches >= MAX_LIVE_QUOTES) break;
    const q = await fetchQuoteTrusted(symbol);
    liveFetches++;
    if (q) quoteMap.set(symbol, q);
  }

  const quotes = [...quoteMap.values()].sort(
    (a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent)
  );

  const hintVolume = new Map(
    hints.map((h) => [h.symbol, { volume: h.volume ?? 0, avgVolume: h.avgVolume ?? 0 }])
  );

  const volumeLeaders: VolumeLeader[] = [];
  const factor = sessionVolumeFactor();
  const volumeCandidates = quotes.slice(0, MAX_CANDLE_LOOKUPS);

  for (const quote of quotes) {
    detectAlerts(quote, 0);
  }

  for (const quote of volumeCandidates) {
    let volume = 0;
    let avgVolume = 0;
    let rVol = 0;

    const volStats = await fetchVolumeForSymbol(quote.symbol);

    if (volStats) {
      volume = volStats.volume;
      avgVolume = volStats.avgVolume;
    } else {
      const hint = hintVolume.get(quote.symbol);
      if (hint && hint.volume > 0) {
        volume = hint.volume;
        avgVolume = hint.avgVolume > 0 ? hint.avgVolume : hint.volume;
      }
    }

    if (volume <= 0) {
      const hint = hintVolume.get(quote.symbol);
      if (hint && hint.volume > 0) {
        volume = hint.volume;
        avgVolume = hint.avgVolume > 0 ? hint.avgVolume : hint.volume;
      } else if (Math.abs(quote.changePercent) >= 2) {
        const estimatedRvol = Math.max(1.2, Math.abs(quote.changePercent) / 6);
        volumeLeaders.push(buildVolumeLeader(quote, 0, 0, estimatedRvol));
        void seedCachedQuote(quote.symbol, {
          price: quote.price,
          changePercent: quote.changePercent,
          change: quote.change,
          rVol: estimatedRvol,
        }).catch(() => {});
        continue;
      } else {
        continue;
      }
    }

    const expected = avgVolume * factor;
    rVol = expected > 0 ? volume / expected : 1;

    detectAlerts(quote, rVol);
    volumeLeaders.push(buildVolumeLeader(quote, volume, avgVolume, rVol));
    void seedCachedQuote(quote.symbol, {
      price: quote.price,
      changePercent: quote.changePercent,
      change: quote.change,
      volume,
      avgVolume,
      rVol,
    }).catch(() => {});
  }

  volumeLeaders.sort((a, b) => {
    if (b.rVol !== a.rVol) return b.rVol - a.rVol;
    return Math.abs(b.changePercent) - Math.abs(a.changePercent);
  });

  let leaders = dedupeVolumeLeaders(volumeLeaders).slice(0, VOLUME_LEADERS_SHOWN);
  if (leaders.length === 0) {
    leaders = buildQuickSnapshot(hints).volumeLeaders;
  }

  const snapshot: MarketScannerSnapshot = {
    alerts: alertFeed,
    volumeLeaders: leaders,
    scannedAt: new Date().toISOString(),
    marketSession: getMarketSession(),
  };

  if (snapshot.alerts.length > 0 || snapshot.volumeLeaders.length > 0) {
    cachedSnapshot = snapshot;
    lastScanAt = Date.now();
  }

  return snapshot;
}

export async function scanMarketActivity(
  extraSymbols: string[] = [],
  catalystHints: CatalystScanHint[] = []
): Promise<MarketScannerSnapshot> {
  if (!process.env.FINNHUB_API_KEY) {
    return getDemoSnapshot();
  }

  const quick = buildQuickSnapshot(catalystHints);
  const cacheFresh = cachedSnapshot && Date.now() - lastScanAt < SCAN_CACHE_MS;

  if (cacheFresh && cachedSnapshot) {
    return cachedSnapshot;
  }

  if (scanInFlight) {
    return cachedSnapshot ?? quick;
  }

  if (!cachedSnapshot) {
    cachedSnapshot = quick;
    scanInFlight = runFullScan(extraSymbols, catalystHints)
      .then((full) => {
        cachedSnapshot = full;
        lastScanAt = Date.now();
        return full;
      })
      .finally(() => {
        scanInFlight = null;
      });
    return quick;
  }

  scanInFlight = runFullScan(extraSymbols, catalystHints)
    .then((full) => {
      cachedSnapshot = full;
      lastScanAt = Date.now();
      return full;
    })
    .finally(() => {
      scanInFlight = null;
    });

  return cachedSnapshot;
}
