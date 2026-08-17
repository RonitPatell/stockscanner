/**
 * Public company events for a ticker What Changed tab.
 * Shared product data — no user read/dismiss state.
 */

import { prisma } from "@/lib/prisma";

export type TickerWhatChangedEvent = {
  id: string;
  title: string;
  summary: string | null;
  category: string;
  severity: string;
  occurredAt: Date;
  sourceUrl: string | null;
};

export async function getTickerWhatChangedEvents(
  symbol: string,
  limit = 24
): Promise<TickerWhatChangedEvent[]> {
  const sym = symbol.trim().toUpperCase();
  const rows = await prisma.companyEvent.findMany({
    where: { symbol: sym },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: Math.min(Math.max(limit, 1), 50),
    select: {
      id: true,
      title: true,
      summary: true,
      category: true,
      severity: true,
      occurredAt: true,
      sourceUrl: true,
    },
  });

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    summary: r.summary,
    category: r.category,
    severity: r.severity,
    occurredAt: r.occurredAt,
    sourceUrl: r.sourceUrl,
  }));
}
