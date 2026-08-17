/**
 * Informational insider cluster detection — no predictive alpha language.
 */

import { createHash } from "node:crypto";
import { prisma } from "../prisma.ts";
import type { ClassifiedCompanyEvent } from "../company-events/classify.ts";
import { persistCompanyEvents } from "../company-events/persist.ts";
import { filingEventFingerprint } from "../company-events/types.ts";
import type { InsiderCluster } from "./types.ts";

/** Default lookback window for cluster detection (calendar days). */
export const INSIDER_CLUSTER_WINDOW_DAYS = 7;
export const INSIDER_CLUSTER_MIN_COUNT = 2;

export async function detectInsiderClusters(
  symbol: string,
  opts?: { windowDays?: number; asOf?: Date; minCount?: number }
): Promise<InsiderCluster[]> {
  const sym = symbol.trim().toUpperCase();
  const windowDays = opts?.windowDays ?? INSIDER_CLUSTER_WINDOW_DAYS;
  const minCount = opts?.minCount ?? INSIDER_CLUSTER_MIN_COUNT;
  const asOf = opts?.asOf ?? new Date();
  const since = new Date(asOf.getTime() - windowDays * 86_400_000);

  const rows = await prisma.insiderTransaction.findMany({
    where: {
      symbol: sym,
      classification: {
        in: ["open_market_purchase", "open_market_sale"],
      },
      OR: [
        { transactionDate: { gte: since, lte: asOf } },
        {
          AND: [
            { transactionDate: null },
            { filedAt: { gte: since, lte: asOf } },
          ],
        },
      ],
    },
    select: {
      classification: true,
      ownerName: true,
      transactionDate: true,
      filedAt: true,
    },
    orderBy: [{ transactionDate: "asc" }, { filedAt: "asc" }],
    take: 100,
  });

  return clusterFromRows(
    sym,
    rows.map((r) => ({
      classification: r.classification,
      ownerName: r.ownerName,
      at: r.transactionDate ?? r.filedAt,
    })),
    { windowDays, minCount }
  );
}

/** Pure helper for tests — cluster from in-memory rows. */
export function clusterFromRows(
  symbol: string,
  rows: Array<{
    classification: string;
    ownerName: string;
    at: Date;
  }>,
  opts?: { windowDays?: number; minCount?: number }
): InsiderCluster[] {
  const windowDays = opts?.windowDays ?? INSIDER_CLUSTER_WINDOW_DAYS;
  const minCount = opts?.minCount ?? INSIDER_CLUSTER_MIN_COUNT;
  const purchases = rows.filter((r) => r.classification === "open_market_purchase");
  const sales = rows.filter((r) => r.classification === "open_market_sale");
  const out: InsiderCluster[] = [];

  const pack = (
    kind: "purchases" | "sales",
    list: typeof rows,
    label: string
  ) => {
    if (list.length < minCount) return;
    const owners = [...new Set(list.map((p) => p.ownerName))];
    const from = new Date(Math.min(...list.map((d) => d.at.getTime())));
    const to = new Date(Math.max(...list.map((d) => d.at.getTime())));
    const spanDays = (to.getTime() - from.getTime()) / 86_400_000;
    if (spanDays > windowDays) return;
    out.push({
      kind,
      symbol: symbol.toUpperCase(),
      windowDays,
      count: list.length,
      owners,
      classifications:
        kind === "purchases"
          ? ["open_market_purchase"]
          : ["open_market_sale"],
      from: from.toISOString(),
      to: to.toISOString(),
      summary: `${list.length} ${label} by ${owners.length} reporting person(s) within ${windowDays} days. Informational cluster — not a trading signal.`,
    });
  };

  pack("purchases", purchases, "open-market purchases");
  pack("sales", sales, "open-market sales");
  return out;
}

export async function emitInsiderClusterEvents(opts: {
  symbol: string;
  cik?: string | null;
  clusters: InsiderCluster[];
  catalystId?: string | null;
}): Promise<{ upserted: number }> {
  const sym = opts.symbol.trim().toUpperCase();
  const events: ClassifiedCompanyEvent[] = opts.clusters.map((c) => {
    const eventType =
      c.kind === "purchases"
        ? ("insider_cluster_purchases" as const)
        : ("insider_cluster_sales" as const);
    const dayKey = c.to.slice(0, 10);
    const discriminant = createHash("sha256")
      .update(`${c.kind}|${c.count}|${c.owners.join(",")}|${dayKey}`)
      .digest("hex")
      .slice(0, 16);

    return {
      symbol: sym,
      cik: opts.cik ?? null,
      category: "insider",
      eventType,
      severity: "info",
      title:
        c.kind === "purchases"
          ? `Insider purchase cluster (${c.count})`
          : `Insider sale cluster (${c.count})`,
      summary: c.summary,
      occurredAt: new Date(c.to),
      sourceType: "derived",
      sourceId: `cluster:${c.kind}:${dayKey}`,
      sourceUrl: null,
      evidenceJson: {
        cluster: c,
        engine: "insider",
      },
      fingerprint: filingEventFingerprint({
        symbol: sym,
        eventType,
        accession: `cluster-${c.kind}-${dayKey}`,
        discriminant,
      }),
      catalystId: opts.catalystId ?? null,
      dilutionInstrumentId: null,
      confidence: 0.7,
    };
  });

  const result = await persistCompanyEvents(events);
  return { upserted: result.upserted };
}
