import { prisma } from "./prisma";
import type { BriefItem, BriefSection, CatalystItem, WatchlistBrief } from "@/types";
import { articleIsAboutSymbol } from "./news-verifier";

export type { WatchlistBrief, BriefItem, BriefSection };

function toBriefItem(c: {
  symbol: string;
  headline: string;
  changePercent?: number | null;
  catalystType?: string | null;
  publishedAt: Date;
  setupTags?: string[];
}): BriefItem {
  return {
    symbol: c.symbol,
    headline: c.headline,
    changePercent: c.changePercent,
    catalystType: c.catalystType,
    publishedAt: c.publishedAt.toISOString(),
    setupTags: c.setupTags,
  };
}

function sessionCutoff(kind: "morning" | "eod"): Date {
  const now = new Date();
  const d = new Date(now);
  if (kind === "morning") {
    d.setHours(4, 0, 0, 0);
    if (now.getHours() < 4) d.setDate(d.getDate() - 1);
    return d;
  }
  // EOD: since 9:30 ET today (approx — server may be UTC)
  d.setHours(9, 30, 0, 0);
  if (now < d) d.setDate(d.getDate() - 1);
  return d;
}

export async function buildWatchlistBrief(
  userId: string,
  kind: "morning" | "eod" | "delta" = "morning"
): Promise<WatchlistBrief | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { watchlist: true, lastBriefSeenAt: true },
  });
  if (!user?.watchlist?.length) return null;

  const symbols = user.watchlist.map((s) => s.toUpperCase());
  const since =
    kind === "delta" && user.lastBriefSeenAt
      ? user.lastBriefSeenAt
      : sessionCutoff(kind === "delta" ? "morning" : kind);

  const rows = (
    await prisma.catalyst.findMany({
      where: {
        symbol: { in: symbols },
        publishedAt: { gte: since },
      },
      orderBy: { publishedAt: "desc" },
      take: 80,
      select: {
        symbol: true,
        headline: true,
        changePercent: true,
        catalystType: true,
        publishedAt: true,
        setupTags: true,
        urgencyScore: true,
      },
    })
  ).filter((r) => articleIsAboutSymbol(r.symbol, r.headline));

  const movers = rows
    .filter((r) => Math.abs(r.changePercent ?? 0) >= 3)
    .slice(0, 8)
    .map(toBriefItem);

  const news = rows.slice(0, 12).map(toBriefItem);

  const earnings = rows
    .filter((r) => r.catalystType === "earnings" || r.setupTags?.includes("earnings_soon"))
    .slice(0, 5)
    .map(toBriefItem);

  const sections: BriefSection[] = [];
  if (kind === "morning" || kind === "delta") {
    if (movers.length) sections.push({ title: "Movers on your list", items: movers });
    if (earnings.length) sections.push({ title: "Earnings catalysts", items: earnings });
  }
  if (news.length) sections.push({ title: "Latest headlines", items: news });

  const newSinceLastCheck =
    kind === "delta" && user.lastBriefSeenAt
      ? rows.filter((r) => r.publishedAt > user.lastBriefSeenAt!).length
      : rows.length;

  const summary =
    kind === "eod"
      ? `${symbols.length} tickers · ${rows.length} stories today · top mover ${movers[0]?.symbol ?? "—"}`
      : `${newSinceLastCheck} new since last check · ${movers.length} movers · ${earnings.length} earnings names`;

  return {
    kind,
    generatedAt: new Date().toISOString(),
    watchlist: symbols,
    sections,
    summary,
    newSinceLastCheck,
  };
}

export async function markBriefSeen(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { lastBriefSeenAt: new Date() },
  });
}

export function briefFromCatalysts(
  watchlist: string[],
  catalysts: CatalystItem[],
  kind: "morning" | "delta"
): WatchlistBrief {
  const set = new Set(watchlist.map((s) => s.toUpperCase()));
  const hits = catalysts.filter(
    (c) =>
      set.has(c.symbol.toUpperCase()) &&
      articleIsAboutSymbol(c.symbol, c.headline, c.aiSummary ?? undefined)
  );
  const movers = hits
    .filter((c) => Math.abs(c.changePercent ?? 0) >= 3)
    .slice(0, 8)
    .map((c) => ({
      symbol: c.symbol,
      headline: c.headline,
      changePercent: c.changePercent,
      catalystType: c.catalystType,
      publishedAt: c.publishedAt,
      setupTags: c.setupTags,
    }));

  const news = hits.slice(0, 10).map((c) => ({
    symbol: c.symbol,
    headline: c.headline,
    changePercent: c.changePercent,
    catalystType: c.catalystType,
    publishedAt: c.publishedAt,
    setupTags: c.setupTags,
  }));

  return {
    kind,
    generatedAt: new Date().toISOString(),
    watchlist,
    sections: [
      { title: "Movers", items: movers },
      { title: "Headlines", items: news },
    ],
    summary: `${hits.length} watchlist stories in feed`,
    newSinceLastCheck: hits.length,
  };
}
