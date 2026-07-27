import { prisma } from "../prisma.ts";
import {
  demoModeLabel,
  getConfiguredDemoMode,
  getDemoDelayMinutes,
  isRedistributionPermitted,
} from "./licensing.ts";
import {
  redactCuratedIfNeeded,
  toPublicDemoRecord,
  type CatalystDemoRow,
} from "./sanitize.ts";
import type { DemoMode, PublicDemoPayload, PublicDemoRecord } from "./types.ts";

const CATALYST_SELECT = {
  id: true,
  symbol: true,
  headline: true,
  source: true,
  sourceUrl: true,
  publishedAt: true,
  createdAt: true,
  catalystType: true,
  aiSummary: true,
  keyPoints: true,
  setupTags: true,
  price: true,
  changePercent: true,
  floatShares: true,
  marketCap: true,
  urgencyScore: true,
  verifiedConfidence: true,
  sourceTier: true,
  isPremarket: true,
} as const;

function asRow(c: {
  id: string;
  symbol: string;
  headline: string;
  source: string;
  sourceUrl: string | null;
  publishedAt: Date;
  createdAt: Date;
  catalystType: string | null;
  aiSummary: string | null;
  keyPoints: string[];
  setupTags: string[];
  price: number | null;
  changePercent: number | null;
  floatShares: number | null;
  marketCap: number | null;
  urgencyScore: number | null;
  verifiedConfidence: number | null;
  sourceTier: string | null;
  isPremarket: boolean;
}): CatalystDemoRow {
  return c;
}

function disclaimerFor(mode: DemoMode, delayMinutes: number | null): string {
  switch (mode) {
    case "DELAYED_REAL":
      return `Real catalyst records delayed by ${delayMinutes ?? 30} minutes. Only redistribution-permitted wires/SEC are shown. Licensed editorial text is redacted; open the source link for the publisher.`;
    case "HISTORICAL_REPLAY":
      return "Replay of a prior market session using real stored catalysts with original timestamps and source links. Not live. No fictional prices or traders.";
    case "CURATED_CASES":
      return "Manually approved historical cases. Evidence and guided notes are product commentary on real events — not fabricated announcements.";
  }
}

async function loadDelayedReal(limit: number): Promise<PublicDemoRecord[]> {
  const delayMin = getDemoDelayMinutes();
  const cutoff = new Date(Date.now() - delayMin * 60_000);
  const since = new Date(Date.now() - 48 * 60 * 60_000);

  const rows = await prisma.catalyst.findMany({
    where: {
      publishedAt: { gte: since, lte: cutoff },
      OR: [
        { sourceTier: "wire" },
        {
          source: {
            in: [
              "SEC EDGAR",
              "GlobeNewswire",
              "Business Wire",
              "PR Newswire",
              "AccessWire",
            ],
          },
        },
      ],
    },
    orderBy: { publishedAt: "desc" },
    take: Math.min(40, limit * 3),
    select: CATALYST_SELECT,
  });

  return rows
    .filter((r) => isRedistributionPermitted(r.source))
    .slice(0, limit)
    .map((r) => toPublicDemoRecord(asRow(r), "DELAYED_REAL"));
}

async function loadHistoricalReplay(limit: number): Promise<{
  records: PublicDemoRecord[];
  sessionDate: string | null;
}> {
  // Prefer a prior ET calendar day with enough wire items
  const rows = await prisma.catalyst.findMany({
    where: {
      publishedAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60_000) },
      OR: [
        { sourceTier: "wire" },
        { source: { in: ["SEC EDGAR", "GlobeNewswire", "Business Wire", "PR Newswire"] } },
      ],
    },
    orderBy: { publishedAt: "desc" },
    take: 200,
    select: CATALYST_SELECT,
  });

  const permitted = rows.filter((r) => isRedistributionPermitted(r.source));
  if (permitted.length === 0) {
    return { records: [], sessionDate: null };
  }

  // Group by ET date; pick the most recent day that is not "today" if possible
  const byDay = new Map<string, typeof permitted>();
  for (const r of permitted) {
    const day = r.publishedAt.toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    });
    const list = byDay.get(day) ?? [];
    list.push(r);
    byDay.set(day, list);
  }

  const todayEt = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
  const days = [...byDay.keys()].sort((a, b) => b.localeCompare(a));
  const sessionDay =
    days.find((d) => d !== todayEt && (byDay.get(d)?.length ?? 0) >= 3) ??
    days.find((d) => (byDay.get(d)?.length ?? 0) >= 1) ??
    null;

  if (!sessionDay) return { records: [], sessionDate: null };

  const dayRows = (byDay.get(sessionDay) ?? [])
    .sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime())
    .slice(0, limit);

  return {
    sessionDate: sessionDay,
    records: dayRows.map((r) => toPublicDemoRecord(asRow(r), "HISTORICAL_REPLAY")),
  };
}

async function loadCuratedCases(limit: number): Promise<PublicDemoRecord[]> {
  const cases = await prisma.demoCase.findMany({
    where: { approved: true },
    orderBy: { publishedAt: "desc" },
    take: limit,
  });

  return cases.map((c) => {
    const record: PublicDemoRecord = {
      id: c.id,
      mode: "CURATED_CASES",
      symbol: c.symbol,
      headline: c.headline,
      source: c.source,
      sourceUrl: c.sourceUrl,
      catalystType: c.catalystType,
      category: (c.catalystType ?? "catalyst").replace(/_/g, " "),
      publishedAt: c.publishedAt.toISOString(),
      ingestedAt: c.ingestedAt.toISOString(),
      eventDateLabel: c.publishedAt.toLocaleDateString("en-US", {
        timeZone: "America/New_York",
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
      priceAtIngest: c.priceAtIngest,
      changePercentAtIngest: c.changePercentAtIngest,
      priceCheckpoints:
        c.priceLater != null || c.changeLater != null
          ? [
              {
                label: c.laterCheckpointLabel ?? "Later",
                price: c.priceLater,
                changePercent: c.changeLater,
                at: null,
              },
            ]
          : [],
      evidence: c.evidence,
      riskFlags: c.riskFlags,
      guided: {
        whatHappened: c.whatHappened,
        whyItMattered: c.whyItMattered,
        trapRisks: c.trapRisks,
        howItReacted: c.howItReacted,
      },
      textRedacted: false,
      redistributionPermitted: isRedistributionPermitted(c.source),
    };
    return redactCuratedIfNeeded(record);
  });
}

export async function getPublicDemoPayload(
  modeOverride?: DemoMode | null
): Promise<PublicDemoPayload> {
  const mode = modeOverride ?? getConfiguredDemoMode();
  const delayMinutes = mode === "DELAYED_REAL" ? getDemoDelayMinutes() : null;
  let records: PublicDemoRecord[] = [];
  let sessionDate: string | null = null;

  if (mode === "DELAYED_REAL") {
    records = await loadDelayedReal(12);
    // Fallback to curated if no delayed wire rows (empty DB)
    if (records.length === 0) {
      records = await loadCuratedCases(8);
    }
  } else if (mode === "HISTORICAL_REPLAY") {
    const replay = await loadHistoricalReplay(12);
    records = replay.records;
    sessionDate = replay.sessionDate;
    if (records.length === 0) {
      records = await loadCuratedCases(8);
    }
  } else {
    records = await loadCuratedCases(12);
  }

  return {
    mode: records[0]?.mode ?? mode,
    modeLabel: demoModeLabel(records[0]?.mode ?? mode),
    delayMinutes,
    sessionDate,
    disclaimer: disclaimerFor(mode, delayMinutes),
    records,
    generatedAt: new Date().toISOString(),
  };
}
