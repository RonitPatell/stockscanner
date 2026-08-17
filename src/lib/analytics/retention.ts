/**
 * Privacy-conscious product analytics persistence + retention funnel queries.
 * Never stores thesis text, emails, phones, webhooks, or secrets.
 */

import { prisma } from "../prisma.ts";
import {
  scrubTrackProps,
  track,
  type FunnelEvent,
  type TrackProps,
} from "./track.ts";

type EventDelegate = {
  create: (args: {
    data: {
      userId: string | null;
      event: string;
      propsJson: unknown;
    };
  }) => Promise<unknown>;
  findMany: (args: {
    where: { event: string };
    select: { createdAt: true; propsJson: true };
    take: number;
    orderBy: { createdAt: "desc" };
  }) => Promise<Array<{ createdAt: Date; propsJson: unknown }>>;
  count: (args: { where: { event: string; createdAt?: { gte: Date } } }) => Promise<number>;
};

function eventDelegate(): EventDelegate | null {
  return (
    (prisma as unknown as { productAnalyticsEvent?: EventDelegate })
      .productAnalyticsEvent ?? null
  );
}

export async function persistProductEvent(opts: {
  userId?: string | null;
  event: FunnelEvent | string;
  props?: TrackProps;
}): Promise<void> {
  const d = eventDelegate();
  if (!d) return;
  try {
    await d.create({
      data: {
        userId: opts.userId ?? null,
        event: opts.event,
        propsJson: scrubTrackProps(opts.props),
      },
    });
  } catch {
    /* counters still recorded via track() */
  }
}

export async function trackRetention(
  event: FunnelEvent,
  opts?: { userId?: string | null; props?: TrackProps }
): Promise<void> {
  void track(event, opts?.props);
  void persistProductEvent({
    userId: opts?.userId,
    event,
    props: opts?.props,
  });
}

function pct(num: number, den: number): number {
  if (den <= 0) return 0;
  return Math.round((num / den) * 1000) / 10;
}

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return {};
}

export type RetentionMetrics = {
  trialUsers: number;
  trialWithOneCompanyPct: number;
  trialWithFiveCompaniesPct: number;
  trialWithThesisPct: number;
  trialWithThreeConditionsPct: number;
  trialWithThesisRelevantEventPct: number;
  watchtowerWeeklyActiveUsers: number;
  portfolioBriefWeeklyOpens: number;
  hydrationSuccessRatePct: number;
  medianHydrationMs: number | null;
  researchOpensFinancialsReadyPct: number;
};

export async function collectRetentionMetrics(): Promise<RetentionMetrics> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600_000);
  const trialWhere = {
    OR: [
      { subscriptionStatus: "trialing" },
      { trialStartedAt: { not: null } },
    ],
  };

  const trialUsers = await prisma.user.findMany({
    where: trialWhere,
    select: {
      id: true,
      portfolioItems: {
        where: { archivedAt: null },
        select: { id: true },
      },
      investmentTheses: {
        select: {
          id: true,
          conditions: { select: { id: true } },
        },
      },
    },
  });

  const n = trialUsers.length;
  const withOne = trialUsers.filter((u) => u.portfolioItems.length >= 1).length;
  const withFive = trialUsers.filter((u) => u.portfolioItems.length >= 5).length;
  const withThesis = trialUsers.filter((u) => u.investmentTheses.length >= 1).length;
  const withThree = trialUsers.filter((u) =>
    u.investmentTheses.some((t) => t.conditions.length >= 3)
  ).length;

  const d = eventDelegate();
  let relevantUsers = 0;
  let watchtowerWeekly = 0;
  let briefWeekly = 0;
  let searched = 0;
  let financialsReady = 0;
  const hydrateDurations: number[] = [];

  if (d) {
    const [rel, wt, brief, searchRows, hydrateReq, hydrateOk] = await Promise.all([
      d.count({
        where: { event: "thesis_relevant_event_detected", createdAt: { gte: weekAgo } },
      }),
      d.count({
        where: { event: "watchtower_event_opened", createdAt: { gte: weekAgo } },
      }),
      d.count({
        where: { event: "portfolio_brief_opened", createdAt: { gte: weekAgo } },
      }),
      d.findMany({
        where: { event: "company_searched" },
        select: { createdAt: true, propsJson: true },
        take: 400,
        orderBy: { createdAt: "desc" },
      }),
      d.findMany({
        where: { event: "company_hydration_requested" },
        select: { createdAt: true, propsJson: true },
        take: 200,
        orderBy: { createdAt: "desc" },
      }),
      d.findMany({
        where: { event: "company_hydration_ready" },
        select: { createdAt: true, propsJson: true },
        take: 200,
        orderBy: { createdAt: "desc" },
      }),
    ]);
    relevantUsers = rel;
    watchtowerWeekly = wt;
    briefWeekly = brief;
    searched = searchRows.length;
    financialsReady = searchRows.filter((r) => {
      const p = asRecord(r.propsJson);
      return p.financials === "READY";
    }).length;

    const reqBySymbol = new Map<string, number>();
    for (const r of hydrateReq) {
      const p = asRecord(r.propsJson);
      const sym = typeof p.symbol === "string" ? p.symbol : null;
      if (sym && !reqBySymbol.has(sym)) reqBySymbol.set(sym, r.createdAt.getTime());
    }
    for (const r of hydrateOk) {
      const p = asRecord(r.propsJson);
      const sym = typeof p.symbol === "string" ? p.symbol : null;
      if (!sym) continue;
      const start = reqBySymbol.get(sym);
      if (start) hydrateDurations.push(r.createdAt.getTime() - start);
    }
  }

  hydrateDurations.sort((a, b) => a - b);
  const median =
    hydrateDurations.length === 0
      ? null
      : hydrateDurations[Math.floor(hydrateDurations.length / 2)] ?? null;

  let jobs: Array<{ status: string }> = [];
  try {
    jobs = await (
      prisma as unknown as {
        companyHydrationJob: {
          findMany: (args: unknown) => Promise<Array<{ status: string }>>;
        };
      }
    ).companyHydrationJob.findMany({
      select: { status: true },
      take: 500,
    });
  } catch {
    jobs = [];
  }
  const terminal = jobs.filter((j) =>
    ["SUCCEEDED", "PARTIAL", "FAILED"].includes(j.status)
  );
  const ok = terminal.filter((j) => j.status === "SUCCEEDED" || j.status === "PARTIAL")
    .length;

  return {
    trialUsers: n,
    trialWithOneCompanyPct: pct(withOne, n),
    trialWithFiveCompaniesPct: pct(withFive, n),
    trialWithThesisPct: pct(withThesis, n),
    trialWithThreeConditionsPct: pct(withThree, n),
    trialWithThesisRelevantEventPct: pct(relevantUsers, n),
    watchtowerWeeklyActiveUsers: watchtowerWeekly,
    portfolioBriefWeeklyOpens: briefWeekly,
    hydrationSuccessRatePct: pct(ok, terminal.length),
    medianHydrationMs: median,
    researchOpensFinancialsReadyPct: pct(financialsReady, searched),
  };
}
