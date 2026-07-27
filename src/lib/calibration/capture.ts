import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.ts";
import {
  classifyEligibility,
  confidenceBucket,
  floatBucket,
  liquidityBucket,
  sessionAt,
} from "./buckets.ts";
import type { PriceSnapshot } from "./types.ts";
import { qualityForQuoteAge } from "./candles.ts";
import { PRIMARY_HORIZON } from "./types.ts";

type SnapshotMap = Partial<Record<string, PriceSnapshot>>;

export interface IngestCaptureInput {
  catalystId: string;
  symbol: string;
  headline: string;
  summary?: string | null;
  publishedAt: Date | string;
  ingestedAt?: Date | string | null;
  catalystType?: string | null;
  sourceTier?: string | null;
  strength?: string | null;
  timing?: string | null;
  verifiedConfidence?: number | null;
  floatShares?: number | null;
  price?: number | null;
  volume?: number | null;
  avgVolume?: number | null;
  changePercent?: number | null;
  quoteObservedAtMs?: number | null;
  spreadPct?: number | null;
}

/**
 * Capture ingest price snapshot when a catalyst is persisted.
 * Creates CatalystOutcome row if missing.
 */
export async function captureIngestSnapshot(
  input: IngestCaptureInput
): Promise<string | null> {
  const eligibility = classifyEligibility({
    headline: input.headline,
    summary: input.summary,
    publishedAt: input.publishedAt,
    ingestedAt: input.ingestedAt ?? new Date(),
    catalystType: input.catalystType,
    timing: input.timing,
  });

  const now = Date.now();
  const observedMs = input.quoteObservedAtMs ?? now;
  let ingestSnap: PriceSnapshot;

  if (input.price != null && input.price > 0) {
    const quality = qualityForQuoteAge(observedMs, now, 90);
    ingestSnap = {
      horizon: "ingest",
      price: input.price,
      observedAt: new Date(observedMs).toISOString(),
      targetAt: new Date(input.ingestedAt ?? now).toISOString(),
      source: "quote_cache",
      quality,
      substituted: false,
      substituteLagSec: null,
      volume: input.volume ?? null,
      spreadPct: input.spreadPct ?? null,
      note: quality === "STALE" ? "stale_quote_at_ingest" : undefined,
    };
  } else {
    ingestSnap = {
      horizon: "ingest",
      price: null,
      observedAt: null,
      targetAt: new Date(input.ingestedAt ?? now).toISOString(),
      source: "unknown",
      quality: "MISSING",
      substituted: false,
      substituteLagSec: null,
      volume: null,
      spreadPct: null,
      note: "no_price_at_ingest",
    };
  }

  const snapshots: SnapshotMap = { ingest: ingestSnap };
  const dollarVol =
    input.price != null && input.volume != null
      ? input.price * input.volume
      : null;

  const row = await prisma.catalystOutcome.upsert({
    where: { catalystId: input.catalystId },
    create: {
      catalystId: input.catalystId,
      symbol: input.symbol.toUpperCase(),
      catalystType: input.catalystType ?? null,
      sourceTier: input.sourceTier ?? null,
      strength: input.strength ?? null,
      confidenceBucket: confidenceBucket(input.verifiedConfidence),
      floatBucket: floatBucket(input.floatShares),
      liquidityBucket: liquidityBucket({
        dollarVolume: dollarVol,
        volume: input.volume,
        price: input.price,
        avgVolume: input.avgVolume,
      }),
      marketSession: sessionAt(input.ingestedAt ?? new Date()),
      eligibleUrgent: eligibility.eligibleUrgent,
      excludeReason: eligibility.excludeReason,
      snapshots: snapshots as Prisma.InputJsonValue,
    },
    update: {
      snapshots: snapshots as Prisma.InputJsonValue,
      catalystType: input.catalystType ?? undefined,
      sourceTier: input.sourceTier ?? undefined,
      strength: input.strength ?? undefined,
      confidenceBucket: confidenceBucket(input.verifiedConfidence),
      floatBucket: floatBucket(input.floatShares),
      liquidityBucket: liquidityBucket({
        dollarVolume: dollarVol,
        volume: input.volume,
        price: input.price,
        avgVolume: input.avgVolume,
      }),
      marketSession: sessionAt(input.ingestedAt ?? new Date()),
      eligibleUrgent: eligibility.eligibleUrgent,
      excludeReason: eligibility.excludeReason,
    },
  });

  return row.id;
}

export function readSnapshots(raw: unknown): SnapshotMap {
  if (!raw || typeof raw !== "object") return {};
  return raw as SnapshotMap;
}

export { PRIMARY_HORIZON };
