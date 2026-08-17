/**
 * Load + compose personalized Portfolio Brief for a session user.
 * userId must come from requireTrustTickerAccess — never from the client.
 */

import { prisma } from "../prisma.ts";
import { parseHealthResultsJson } from "../thesis/health/parse-results.ts";
import {
  getWatchtowerFeed,
  listMonitoredSymbolsForUser,
} from "../watchtower/service.ts";
import { watchtowerFeedQuerySchema } from "../watchtower/schemas.ts";
import { composePortfolioBrief } from "./compose.ts";
import type {
  BriefEventInput,
  BriefThesisSnapshot,
  PortfolioBriefDto,
  PortfolioBriefUpcomingItem,
} from "./types.ts";
import { getCachedPortfolioBrief, setCachedPortfolioBrief } from "./cache.ts";

const DEFAULT_WINDOW_DAYS = 7;

function snapshotsFromEvaluations(
  thesisId: string,
  symbol: string,
  rows: { resultsJson: unknown; evaluatedAt: Date }[]
): { latest: BriefThesisSnapshot | null; previous: BriefThesisSnapshot | null } {
  const mapped = rows.map((row) => {
    const parsed = parseHealthResultsJson(row.resultsJson);
    const conditions = [...parsed.byConditionId.entries()].map(
      ([conditionId, ev]) => {
        if (ev.mode === "manual") {
          return {
            conditionId,
            label: conditionId,
            polarity: "support_if",
            state: null as string | null,
            mode: "manual" as const,
            explanation: ev.explanation ?? null,
          };
        }
        return {
          conditionId,
          label: conditionId,
          polarity: "support_if",
          state: ev.state,
          mode: "automated" as const,
          explanation: ev.explanation ?? null,
        };
      }
    );
    return {
      thesisId,
      symbol,
      evaluatedAt: row.evaluatedAt.toISOString(),
      conditions,
    } satisfies BriefThesisSnapshot;
  });

  // Enrich labels/polarity from live conditions when available — filled by caller
  return {
    latest: mapped[0] ?? null,
    previous: mapped[1] ?? null,
  };
}

async function loadThesisSnapshots(
  userId: string,
  symbols: string[]
): Promise<{
  latest: BriefThesisSnapshot[];
  previousByThesisId: Map<string, BriefThesisSnapshot>;
}> {
  if (!symbols.length) {
    return { latest: [], previousByThesisId: new Map() };
  }

  const theses = await prisma.investmentThesis.findMany({
    where: {
      userId,
      status: "active",
      symbol: { in: symbols },
    },
    select: {
      id: true,
      symbol: true,
      conditions: {
        select: { id: true, label: true, polarity: true },
      },
      evaluations: {
        orderBy: { evaluatedAt: "desc" },
        take: 2,
        select: { resultsJson: true, evaluatedAt: true },
      },
    },
  });

  const latest: BriefThesisSnapshot[] = [];
  const previousByThesisId = new Map<string, BriefThesisSnapshot>();

  for (const th of theses) {
    const labelById = new Map(th.conditions.map((c) => [c.id, c]));
    const { latest: L, previous: P } = snapshotsFromEvaluations(
      th.id,
      th.symbol,
      th.evaluations
    );
    if (L) {
      L.conditions = L.conditions.map((c) => {
        const meta = labelById.get(c.conditionId);
        return {
          ...c,
          label: meta?.label ?? c.label,
          polarity: meta?.polarity ?? c.polarity,
        };
      });
      latest.push(L);
    }
    if (P) {
      P.conditions = P.conditions.map((c) => {
        const meta = labelById.get(c.conditionId);
        return {
          ...c,
          label: meta?.label ?? c.label,
          polarity: meta?.polarity ?? c.polarity,
        };
      });
      previousByThesisId.set(th.id, P);
    }
  }

  return { latest, previousByThesisId };
}

async function loadUpcoming(
  symbols: string[]
): Promise<{ items: PortfolioBriefUpcomingItem[]; fromCalendar: boolean }> {
  if (!symbols.length) return { items: [], fromCalendar: false };
  try {
    const { resolveFinnhubKey } = await import("../finnhub-key.ts");
    if (!resolveFinnhubKey()) return { items: [], fromCalendar: false };
    const { fetchUpcomingEarningsBatch } = await import(
      "../earnings-calendar.ts"
    );
    const events = await fetchUpcomingEarningsBatch(symbols.slice(0, 40));
    return {
      fromCalendar: events.length > 0,
      items: events.map((e) => ({
        symbol: e.symbol,
        label: "Upcoming earnings",
        date: e.date,
        source: "earnings_calendar" as const,
        sourceUrl: null,
      })),
    };
  } catch {
    return { items: [], fromCalendar: false };
  }
}

export type BuildPortfolioBriefOpts = {
  /** Lookback days (default 7). */
  windowDays?: number;
  since?: Date;
  until?: Date;
  now?: Date;
  /** Skip Redis/memory cache */
  bypassCache?: boolean;
};

/**
 * Build Portfolio Brief for an entitled user.
 * @param userId Session user id from requireTrustTickerAccess only.
 */
export async function buildPortfolioBrief(
  userId: string,
  opts: BuildPortfolioBriefOpts = {}
): Promise<PortfolioBriefDto> {
  const now = opts.now ?? new Date();
  const windowDays = Math.min(30, Math.max(1, opts.windowDays ?? DEFAULT_WINDOW_DAYS));
  const until = opts.until ?? now;
  const defaultSince = new Date(until.getTime() - windowDays * 24 * 60 * 60 * 1000);

  let lastBriefSeenAt: Date | null = null;
  if (!opts.since) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { lastBriefSeenAt: true },
    });
    lastBriefSeenAt = user?.lastBriefSeenAt ?? null;
  }
  const since =
    opts.since ??
    (lastBriefSeenAt && lastBriefSeenAt.getTime() < until.getTime()
      ? lastBriefSeenAt
      : defaultSince);

  if (!opts.bypassCache) {
    const cached = await getCachedPortfolioBrief(userId, since, until);
    if (cached) return cached;
  }

  const monitored = await listMonitoredSymbolsForUser(userId);

  if (monitored.length === 0) {
    const empty = composePortfolioBrief({
      monitoredSymbols: [],
      events: [],
      thesisLatest: [],
      thesisPreviousByThesisId: new Map(),
      since,
      until,
      windowDays,
      now,
    });
    await setCachedPortfolioBrief(userId, since, until, empty);
    if (!opts.since) {
      await prisma.user.update({
        where: { id: userId },
        data: { lastBriefSeenAt: until },
      }).catch(() => {});
    }
    return empty;
  }

  const query = watchtowerFeedQuerySchema.parse({
    significance: ["HIGH", "MEDIUM"],
    since: since.toISOString(),
    until: until.toISOString(),
    limit: 50,
    includeDismissed: true,
  });

  const feed = await getWatchtowerFeed(userId, query);
  const events: BriefEventInput[] = feed.ok
    ? feed.result.items.map((i) => ({
        id: i.id,
        symbol: i.symbol,
        title: i.title,
        summary: i.summary,
        category: i.category,
        eventType: i.eventType,
        significanceLevel: i.significance.level,
        occurredAt: i.occurredAt,
        sourceUrl: i.source.url,
      }))
    : [];

  const thesis = await loadThesisSnapshots(userId, monitored);
  const upcoming = await loadUpcoming(monitored);

  const brief = composePortfolioBrief({
    monitoredSymbols: monitored,
    events,
    thesisLatest: thesis.latest,
    thesisPreviousByThesisId: thesis.previousByThesisId,
    upcoming: upcoming.items,
    upcomingFromCalendar: upcoming.fromCalendar,
    since,
    until,
    windowDays,
    now,
  });

  await setCachedPortfolioBrief(userId, since, until, brief);
  if (!opts.since) {
    await prisma.user.update({
      where: { id: userId },
      data: { lastBriefSeenAt: until },
    }).catch(() => {});
  }
  return brief;
}
