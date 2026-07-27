import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.ts";
import {
  HORIZON_OFFSET_MINUTES,
  PRIMARY_HORIZON,
  type OutcomeHorizon,
  type PriceSnapshot,
} from "./types.ts";
import { readSnapshots } from "./capture.ts";
import {
  nextRegularOpenEt,
  priceAtTarget,
  sessionCloseEt,
  type CandleSet,
} from "./candles.ts";
import { fetchDailyCandleSet, fetchMinuteCandleSet } from "./fetch-candles.ts";
import { BENCHMARK_SPY, computeHorizonMetrics, sectorEtfForSymbol } from "./metrics.ts";
import { emptySnapshot } from "./buckets.ts";

type SnapshotMap = Partial<Record<string, PriceSnapshot>>;
type MetricsMap = Partial<Record<string, ReturnType<typeof computeHorizonMetrics>>>;

const TIMED = Object.keys(HORIZON_OFFSET_MINUTES) as Array<
  keyof typeof HORIZON_OFFSET_MINUTES
>;

function needsHorizon(snapshots: SnapshotMap, h: OutcomeHorizon): boolean {
  const s = snapshots[h];
  return !s || s.price == null || s.quality === "MISSING";
}

async function loadBars(
  symbol: string,
  fromSec: number,
  toSec: number
): Promise<CandleSet | null> {
  return fetchMinuteCandleSet(symbol, fromSec, toSec);
}

/**
 * Backfill pending horizon snapshots for recent outcomes.
 */
export async function backfillCatalystOutcomes(opts?: {
  limit?: number;
  maxAgeHours?: number;
}): Promise<{ processed: number; updated: number }> {
  const limit = opts?.limit ?? 25;
  const maxAgeHours = opts?.maxAgeHours ?? 72;
  const since = new Date(Date.now() - maxAgeHours * 3600_000);

  const rows = await prisma.catalystOutcome.findMany({
    where: {
      createdAt: { gte: since },
      OR: [{ dataComplete: false }, { lastBackfillAt: null }, { rawReturnPct: null }],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let updated = 0;
  for (const row of rows) {
    const ok = await backfillOne(row.id);
    if (ok) updated++;
    await sleep(350);
  }
  return { processed: rows.length, updated };
}

async function backfillOne(outcomeId: string): Promise<boolean> {
  const row = await prisma.catalystOutcome.findUnique({ where: { id: outcomeId } });
  if (!row) return false;

  const catalyst = await prisma.catalyst.findUnique({
    where: { id: row.catalystId },
    select: { createdAt: true, publishedAt: true },
  });
  if (!catalyst) return false;

  const ingestAt = catalyst.createdAt;
  const ingestSec = Math.floor(ingestAt.getTime() / 1000);
  const snapshots = readSnapshots(row.snapshots);
  const entry = snapshots.ingest;

  const nowSec = Math.floor(Date.now() / 1000);
  const pendingTimed = TIMED.filter((h) => {
    const due = ingestSec + HORIZON_OFFSET_MINUTES[h] * 60;
    return nowSec >= due + 30 && needsHorizon(snapshots, h);
  });

  const needClose = nowSec >= Math.floor(sessionCloseEt(ingestAt).getTime() / 1000) + 60;
  const needNextOpen =
    nowSec >= Math.floor(nextRegularOpenEt(ingestAt).getTime() / 1000) + 60;

  if (
    pendingTimed.length === 0 &&
    !(needClose && needsHorizon(snapshots, "close")) &&
    !(needNextOpen && needsHorizon(snapshots, "next_open"))
  ) {
    // Still may need metrics recompute
    if (snapshots[PRIMARY_HORIZON]?.price != null && row.rawReturnPct == null) {
      await persistMetrics(row.id, snapshots, null);
      return true;
    }
    return false;
  }

  const farthestMin = Math.max(
    60,
    ...pendingTimed.map((h) => HORIZON_OFFSET_MINUTES[h]),
    needClose || needNextOpen ? 60 * 24 : 0
  );
  const from = ingestSec - 120;
  const to = ingestSec + farthestMin * 60 + 300;

  const candles = await loadBars(row.symbol, from, to);
  const spyCandles = await loadBars(BENCHMARK_SPY, from, to);
  const sector = sectorEtfForSymbol(row.symbol);
  const sectorCandles = sector ? await loadBars(sector, from, to) : null;

  const entryPrice = entry?.price ?? null;

  for (const h of pendingTimed) {
    const target = ingestSec + HORIZON_OFFSET_MINUTES[h] * 60;
    if (!candles) {
      snapshots[h] = emptySnapshot(h, new Date(target * 1000).toISOString(), "no_candles");
      continue;
    }
    snapshots[h] = priceAtTarget(candles, target, {
      horizon: h,
      entryPrice,
      maxSubstituteLagSec: h === "m1" ? 90 : 180,
    });
  }

  if (needClose && needsHorizon(snapshots, "close")) {
    const closeAt = sessionCloseEt(ingestAt);
    const closeSec = Math.floor(closeAt.getTime() / 1000);
    if (candles) {
      snapshots.close = priceAtTarget(candles, closeSec, {
        horizon: "close",
        entryPrice,
        maxSubstituteLagSec: 600,
        source: "finnhub_1m",
      });
    } else {
      const daily = await fetchDailyCandleSet(
        row.symbol,
        ingestSec - 86400,
        ingestSec + 86400 * 2
      );
      if (daily?.bars.length) {
        // Use daily close for the session day
        const bar = daily.bars.find((b) => b.t >= ingestSec - 6 * 3600) ?? daily.bars[0]!;
        snapshots.close = {
          horizon: "close",
          price: bar.c,
          observedAt: new Date(bar.t * 1000).toISOString(),
          targetAt: closeAt.toISOString(),
          source: "finnhub_daily",
          quality: "CANDLE_CLOSE",
          substituted: false,
          substituteLagSec: null,
          volume: bar.v ?? null,
          spreadPct: null,
        };
      } else {
        snapshots.close = emptySnapshot("close", closeAt.toISOString(), "no_close_candle");
      }
    }
  }

  if (needNextOpen && needsHorizon(snapshots, "next_open")) {
    const openAt = nextRegularOpenEt(ingestAt);
    const openSec = Math.floor(openAt.getTime() / 1000);
    if (candles) {
      snapshots.next_open = priceAtTarget(candles, openSec, {
        horizon: "next_open",
        entryPrice,
        maxSubstituteLagSec: 600,
      });
    } else {
      snapshots.next_open = emptySnapshot(
        "next_open",
        openAt.toISOString(),
        "no_candles_for_next_open"
      );
    }
  }

  // Benchmark snapshots at ingest + primary for relative returns
  const spyIngest = spyCandles
    ? priceAtTarget(spyCandles, ingestSec, { horizon: "ingest", maxSubstituteLagSec: 120 })
    : emptySnapshot("ingest", ingestAt.toISOString(), "no_spy");
  const primaryTarget =
    ingestSec + HORIZON_OFFSET_MINUTES.m15 * 60;
  const spyPrimary = spyCandles
    ? priceAtTarget(spyCandles, primaryTarget, {
        horizon: PRIMARY_HORIZON,
        maxSubstituteLagSec: 180,
      })
    : emptySnapshot(PRIMARY_HORIZON, new Date(primaryTarget * 1000).toISOString());

  let sectorIngest = emptySnapshot("ingest", ingestAt.toISOString(), "no_sector");
  let sectorPrimary = emptySnapshot(PRIMARY_HORIZON, new Date(primaryTarget * 1000).toISOString());
  if (sectorCandles) {
    sectorIngest = priceAtTarget(sectorCandles, ingestSec, {
      horizon: "ingest",
      maxSubstituteLagSec: 120,
    });
    sectorPrimary = priceAtTarget(sectorCandles, primaryTarget, {
      horizon: PRIMARY_HORIZON,
      maxSubstituteLagSec: 180,
    });
  }

  const metrics: MetricsMap = {};
  for (const h of [...TIMED, "close", "next_open"] as OutcomeHorizon[]) {
    const exit = snapshots[h];
    if (!exit) continue;
    const exitSec =
      h === "close"
        ? Math.floor(sessionCloseEt(ingestAt).getTime() / 1000)
        : h === "next_open"
          ? Math.floor(nextRegularOpenEt(ingestAt).getTime() / 1000)
          : ingestSec + (HORIZON_OFFSET_MINUTES[h as keyof typeof HORIZON_OFFSET_MINUTES] ?? 0) * 60;

    metrics[h] = computeHorizonMetrics({
      horizon: h,
      entry: entry ?? null,
      exit,
      spyEntry: spyIngest,
      spyExit: h === PRIMARY_HORIZON ? spyPrimary : spyIngest,
      sectorEntry: sectorIngest,
      sectorExit: h === PRIMARY_HORIZON ? sectorPrimary : sectorIngest,
      candles,
      ingestSec,
      exitSec,
    });
  }

  // Fix spy/sector for each timed horizon properly
  for (const h of TIMED) {
    const exit = snapshots[h];
    if (!exit || !spyCandles) continue;
    const t = ingestSec + HORIZON_OFFSET_MINUTES[h] * 60;
    const spyExit = priceAtTarget(spyCandles, t, { horizon: h, maxSubstituteLagSec: 180 });
    const sectorExit = sectorCandles
      ? priceAtTarget(sectorCandles, t, { horizon: h, maxSubstituteLagSec: 180 })
      : null;
    metrics[h] = computeHorizonMetrics({
      horizon: h,
      entry: entry ?? null,
      exit,
      spyEntry: spyIngest,
      spyExit,
      sectorEntry: sectorIngest,
      sectorExit,
      candles,
      ingestSec,
      exitSec: t,
    });
  }

  const primary = metrics[PRIMARY_HORIZON];
  const complete =
    !needsHorizon(snapshots, "m15") &&
    !needsHorizon(snapshots, "m60") &&
    Boolean(snapshots.close?.price || snapshots.close?.quality === "MISSING");

  // If entry was stale / missing — mark exclude for urgent if not already
  let excludeReason = row.excludeReason;
  let eligibleUrgent = row.eligibleUrgent;
  if (entry?.quality === "STALE" && eligibleUrgent) {
    eligibleUrgent = false;
    excludeReason = excludeReason || "stale_quote";
  }
  if (
    (primary?.invalidReason === "split_suspect" ||
      primary?.invalidReason === "extreme_gap" ||
      primary?.invalidReason === "halted") &&
    eligibleUrgent
  ) {
    eligibleUrgent = false;
    excludeReason = primary.invalidReason;
  }

  await prisma.catalystOutcome.update({
    where: { id: row.id },
    data: {
      snapshots: snapshots as Prisma.InputJsonValue,
      metrics: metrics as Prisma.InputJsonValue,
      rawReturnPct: primary?.rawReturnPct ?? null,
      spyRelativePct: primary?.spyRelativePct ?? null,
      sectorRelativePct: primary?.sectorRelativePct ?? null,
      mfePct: primary?.mfePct ?? null,
      maePct: primary?.maePct ?? null,
      volumeChangePct: primary?.volumeChangePct ?? null,
      spreadPct: primary?.spreadPct ?? null,
      dataComplete: complete,
      lastBackfillAt: new Date(),
      eligibleUrgent,
      excludeReason,
    },
  });

  return true;
}

async function persistMetrics(
  id: string,
  snapshots: SnapshotMap,
  candles: CandleSet | null
): Promise<void> {
  const entry = snapshots.ingest ?? null;
  const exit = snapshots[PRIMARY_HORIZON] ?? null;
  const m = computeHorizonMetrics({
    horizon: PRIMARY_HORIZON,
    entry,
    exit,
    spyEntry: null,
    spyExit: null,
    sectorEntry: null,
    sectorExit: null,
    candles,
  });
  await prisma.catalystOutcome.update({
    where: { id },
    data: {
      rawReturnPct: m.rawReturnPct,
      mfePct: m.mfePct,
      maePct: m.maePct,
      lastBackfillAt: new Date(),
    },
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
