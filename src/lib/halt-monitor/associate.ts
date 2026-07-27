import { prisma } from "../prisma.ts";
import type { HaltRecord } from "./types.ts";

/**
 * Associate catalysts / filings that arrive during an active halt window.
 */
export async function associateCatalystsDuringHalt(
  record: HaltRecord,
  opts?: { nowMs?: number }
): Promise<HaltRecord> {
  const start = Date.parse(record.haltStartAt);
  if (!Number.isFinite(start)) return record;
  const end = opts?.nowMs ?? Date.now();
  // If resumed, only associate until resumption trade time or updatedAt
  const until =
    record.lifecycle === "resumed" && record.officialResumptionTradeAt
      ? Date.parse(record.officialResumptionTradeAt)
      : end;

  try {
    const rows = await prisma.catalyst.findMany({
      where: {
        symbol: record.symbol.toUpperCase(),
        publishedAt: {
          gte: new Date(start),
          lte: new Date(Number.isFinite(until) ? until : end),
        },
      },
      select: { id: true, source: true, catalystType: true },
      take: 50,
      orderBy: { publishedAt: "asc" },
    });

    const catalystIds = [...new Set([...record.catalystIds, ...rows.map((r) => r.id)])];
    const filingOrNewsIds = [
      ...new Set([
        ...record.filingOrNewsIds,
        ...rows
          .filter(
            (r) =>
              r.source === "SEC EDGAR" ||
              (r.catalystType ?? "").includes("sec") ||
              /filing|8-k|s-1|s-3|424/i.test(r.catalystType ?? "")
          )
          .map((r) => r.id),
      ]),
    ];

    return { ...record, catalystIds, filingOrNewsIds };
  } catch {
    return record;
  }
}

/** Pure helper for tests without DB. */
export function associateIdsDuringWindow(input: {
  haltStartAt: string;
  untilAt: string;
  items: Array<{ id: string; at: string; isFiling?: boolean }>;
  priorCatalystIds?: string[];
  priorFilingIds?: string[];
}): { catalystIds: string[]; filingOrNewsIds: string[] } {
  const start = Date.parse(input.haltStartAt);
  const until = Date.parse(input.untilAt);
  const inWindow = input.items.filter((i) => {
    const t = Date.parse(i.at);
    return Number.isFinite(t) && t >= start && t <= until;
  });
  return {
    catalystIds: [
      ...new Set([...(input.priorCatalystIds ?? []), ...inWindow.map((i) => i.id)]),
    ],
    filingOrNewsIds: [
      ...new Set([
        ...(input.priorFilingIds ?? []),
        ...inWindow.filter((i) => i.isFiling).map((i) => i.id),
      ]),
    ],
  };
}
