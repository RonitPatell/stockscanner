/**
 * Load company What Changed feed (DB).
 * Public mode: shared events only, no thesis.
 * Entitled mode: optional thesis overlay (session userId only).
 */

import { prisma } from "../prisma.ts";
import { hasTrustTickerAccess } from "../subscription.ts";
import { buildCompanyWhatChangedFeed } from "./build-feed.ts";
import type {
  CompanyWhatChangedFeed,
  EventRowForWhatChanged,
  ThesisConditionOverlayInput,
  WhatChangedAccessMode,
  WhatChangedWindow,
} from "./types.ts";
import { resolveWhatChangedSince } from "./windows.ts";

const EVENT_SELECT = {
  id: true,
  symbol: true,
  category: true,
  eventType: true,
  severity: true,
  title: true,
  summary: true,
  occurredAt: true,
  detectedAt: true,
  sourceType: true,
  sourceId: true,
  sourceUrl: true,
  evidenceJson: true,
  beforeJson: true,
  afterJson: true,
} as const;

export type GetCompanyWhatChangedOpts = {
  symbol: string;
  window?: WhatChangedWindow;
  showAllActivity?: boolean;
  /** ISO last meaningful view — for since_last_view */
  lastViewIso?: string | null;
  accessMode?: WhatChangedAccessMode;
  /** Session user id only — never from client body as ownership claim alone */
  userId?: string | null;
  now?: Date;
};

async function loadThesisConditionsForUser(
  userId: string,
  symbol: string
): Promise<ThesisConditionOverlayInput[]> {
  const thesis = await prisma.investmentThesis.findUnique({
    where: { userId_symbol: { userId, symbol } },
    select: {
      status: true,
      conditions: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          conditionType: true,
          label: true,
          polarity: true,
          paramsJson: true,
        },
      },
    },
  });
  if (!thesis || thesis.status === "archived") return [];
  return thesis.conditions.map((c) => ({
    id: c.id,
    conditionType: c.conditionType,
    label: c.label,
    polarity: c.polarity,
    params:
      c.paramsJson &&
      typeof c.paramsJson === "object" &&
      !Array.isArray(c.paramsJson)
        ? (c.paramsJson as Record<string, unknown>)
        : {},
  }));
}

async function loadFinancialDeltaLines(symbol: string): Promise<{
  lines: string[];
  asOf: string | null;
  sourceUrl: string | null;
}> {
  try {
    const { getQuarterlyDeltaForSymbol } = await import(
      "../metrics/get-quarterly-delta.ts"
    );
    const {
      formatAbsoluteChange,
      formatRelativeChange,
      formatMetricValue,
    } = await import("../metrics/format-delta.ts");
    const report = await getQuarterlyDeltaForSymbol(symbol);
    if (!report || report.empty) {
      return { lines: [], asOf: null, sourceUrl: null };
    }
    const material = report.rows.filter(
      (r) =>
        r.comparable &&
        (r.emphasis === "material_higher" || r.emphasis === "material_lower")
    );
    if (!material.length) {
      return { lines: [], asOf: report.asOf, sourceUrl: null };
    }
    const lines = material.slice(0, 4).map((r) => {
      const rel = formatRelativeChange(r);
      const abs = formatAbsoluteChange(r.metricKey, r.absoluteChange);
      const cur = formatMetricValue(r.metricKey, r.current?.value ?? null);
      return `${r.label}: ${cur} (${rel}${abs !== "—" ? `, ${abs}` : ""})`;
    });
    return { lines, asOf: report.asOf, sourceUrl: null };
  } catch {
    return { lines: [], asOf: null, sourceUrl: null };
  }
}

/**
 * Resolve access mode from optional session user (page/API helpers).
 */
export async function resolveWhatChangedAccess(opts: {
  userId?: string | null;
}): Promise<{ accessMode: WhatChangedAccessMode; userId: string | null }> {
  if (!opts.userId) return { accessMode: "public", userId: null };
  const user = await prisma.user.findUnique({
    where: { id: opts.userId },
    select: {
      id: true,
      subscriptionStatus: true,
      subscriptionEndsAt: true,
    },
  });
  if (!user || !hasTrustTickerAccess(user)) {
    return { accessMode: "public", userId: null };
  }
  return { accessMode: "entitled", userId: user.id };
}

export async function getCompanyWhatChangedFeed(
  opts: GetCompanyWhatChangedOpts
): Promise<CompanyWhatChangedFeed> {
  const sym = opts.symbol.trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5);
  const window = opts.window ?? "30d";
  const showAllActivity = opts.showAllActivity === true;
  const accessMode = opts.accessMode ?? "public";
  const now = opts.now ?? new Date();

  const bounds = resolveWhatChangedSince({
    window,
    now,
    lastViewIso: opts.lastViewIso,
  });

  const rows = await prisma.companyEvent.findMany({
    where: {
      symbol: sym,
      ...(bounds.since
        ? {
            occurredAt: {
              gte: bounds.since,
              ...(bounds.until ? { lte: bounds.until } : {}),
            },
          }
        : {}),
    },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: 80,
    select: EVENT_SELECT,
  });

  const events: EventRowForWhatChanged[] = rows.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    category: r.category,
    eventType: r.eventType,
    severity: r.severity,
    title: r.title,
    summary: r.summary,
    occurredAt: r.occurredAt,
    detectedAt: r.detectedAt,
    sourceType: r.sourceType,
    sourceId: r.sourceId,
    sourceUrl: r.sourceUrl,
    evidenceJson: r.evidenceJson,
    beforeJson: r.beforeJson,
    afterJson: r.afterJson,
  }));

  let thesisConditions: ThesisConditionOverlayInput[] | null = null;
  if (accessMode === "entitled" && opts.userId) {
    thesisConditions = await loadThesisConditionsForUser(opts.userId, sym);
  }

  const financial = await loadFinancialDeltaLines(sym);

  return buildCompanyWhatChangedFeed({
    symbol: sym,
    events,
    window,
    since: bounds.since,
    until: bounds.until,
    showAllActivity,
    accessMode,
    usedFallbackWindow: bounds.usedFallbackWindow,
    fallbackWindow: bounds.fallbackWindow,
    thesisConditions,
    financialDeltaLines: financial.lines,
    financialDeltaAsOf: financial.asOf,
    financialDeltaSourceUrl: financial.sourceUrl,
    now: now.getTime(),
  });
}

/** @deprecated Prefer getCompanyWhatChangedFeed — kept for older imports. */
export async function getTickerWhatChangedEvents(
  symbol: string,
  limit = 24
): Promise<
  Array<{
    id: string;
    title: string;
    summary: string | null;
    category: string;
    severity: string;
    occurredAt: Date;
    sourceUrl: string | null;
  }>
> {
  const feed = await getCompanyWhatChangedFeed({
    symbol,
    window: "30d",
    showAllActivity: true,
    accessMode: "public",
  });
  return feed.cards.slice(0, limit).map((c) => ({
    id: c.id,
    title: c.whatHappened,
    summary: c.whatChanged,
    category: c.category,
    severity: c.significance.level?.toLowerCase() ?? "unknown",
    occurredAt: new Date(c.when),
    sourceUrl: c.source.url,
  }));
}
