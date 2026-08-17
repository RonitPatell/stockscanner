/**
 * Watchtower backend — "What materially changed across companies I monitor?"
 *
 * - Session userId only (callers pass DB user id from requireTrustTickerAccess)
 * - Single portfolio query + single events query with scoped userStates include
 * - No N+1; company names batch-loaded
 * - Private read/dismiss never leak across users
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma.ts";
import {
  SIGNIFICANCE_LEVELS,
  significanceToLegacySeverity,
  type SignificanceEvidenceItem,
  type SignificanceLevel,
  type SignificanceReasonCode,
} from "../company-events/significance.ts";
import {
  decodeWatchtowerCursor,
  encodeWatchtowerCursor,
} from "./cursor.ts";
import type { WatchtowerFeedQuery } from "./schemas.ts";
import type {
  WatchtowerEventDto,
  WatchtowerFeedResult,
  WatchtowerSignificanceDto,
} from "./types.ts";
import type {
  ThesisConditionOverlayInput,
  ThesisRelevanceDto,
} from "../ticker-what-changed/types.ts";
import { overlayWatchtowerThesisRelevance } from "./thesis-overlay.ts";

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
} as const;

type EventRow = {
  id: string;
  symbol: string;
  category: string;
  eventType: string;
  severity: string;
  title: string;
  summary: string | null;
  occurredAt: Date;
  detectedAt: Date;
  sourceType: string;
  sourceId: string | null;
  sourceUrl: string | null;
  evidenceJson: unknown;
  userStates: { readAt: Date | null; dismissedAt: Date | null }[];
};

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return {};
}

function parseSignificance(evidenceJson: unknown): WatchtowerSignificanceDto {
  const root = asRecord(evidenceJson);
  const sig = asRecord(root.significance);
  const levelRaw = sig.level;
  const level =
    typeof levelRaw === "string" &&
    (SIGNIFICANCE_LEVELS as readonly string[]).includes(levelRaw)
      ? (levelRaw as SignificanceLevel)
      : null;

  const reasonCodes = Array.isArray(sig.reasonCodes)
    ? (sig.reasonCodes.filter(
        (c) => typeof c === "string"
      ) as SignificanceReasonCode[])
    : [];

  const evidence: SignificanceEvidenceItem[] = Array.isArray(sig.evidence)
    ? (sig.evidence.filter(
        (e) =>
          e &&
          typeof e === "object" &&
          typeof (e as SignificanceEvidenceItem).code === "string" &&
          typeof (e as SignificanceEvidenceItem).detail === "string"
      ) as SignificanceEvidenceItem[])
    : [];

  return {
    level,
    reasonCodes,
    evidence,
    engineVersion:
      typeof sig.engineVersion === "string" ? sig.engineVersion : null,
    thesisRelevance: null,
  };
}

/** Public evidence for clients — strip nested significance (returned separately). */
function publicEvidence(evidenceJson: unknown): Record<string, unknown> {
  const root = { ...asRecord(evidenceJson) };
  delete root.significance;
  return root;
}

function significanceLevelsToSeverities(
  levels: SignificanceLevel[] | undefined
): string[] | undefined {
  if (!levels?.length) return undefined;
  return [...new Set(levels.map((l) => significanceToLegacySeverity(l)))];
}

export async function listMonitoredSymbolsForUser(
  userId: string
): Promise<string[]> {
  const rows = await prisma.portfolioItem.findMany({
    where: { userId, archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { symbol: true },
  });
  return rows.map((r) => r.symbol);
}

/**
 * Exclude events based on THIS user's private read/dismiss rows only.
 */
function buildUserStateExclusion(
  userId: string,
  opts: { includeDismissed: boolean; unreadOnly: boolean }
): Prisma.CompanyEventWhereInput | null {
  const { includeDismissed, unreadOnly } = opts;
  if (includeDismissed && !unreadOnly) return null;

  if (!includeDismissed && unreadOnly) {
    return {
      NOT: {
        userStates: {
          some: {
            userId,
            OR: [
              { dismissedAt: { not: null } },
              { readAt: { not: null } },
            ],
          },
        },
      },
    };
  }
  if (!includeDismissed) {
    return {
      NOT: {
        userStates: {
          some: { userId, dismissedAt: { not: null } },
        },
      },
    };
  }
  return {
    NOT: {
      userStates: {
        some: { userId, readAt: { not: null } },
      },
    },
  };
}

function buildEventWhere(opts: {
  symbols: string[];
  query: WatchtowerFeedQuery;
  cursor: ReturnType<typeof decodeWatchtowerCursor>;
  userId: string;
}): Prisma.CompanyEventWhereInput {
  const { symbols, query, cursor, userId } = opts;

  const severityFromSig = significanceLevelsToSeverities(query.significance);
  const severities = [
    ...(query.severity ?? []),
    ...(severityFromSig ?? []),
  ];
  const uniqueSeverities = severities.length
    ? [...new Set(severities)]
    : undefined;

  const and: Prisma.CompanyEventWhereInput[] = [
    { symbol: { in: symbols } },
  ];

  if (query.category?.length) {
    and.push({ category: { in: query.category } });
  }
  if (uniqueSeverities?.length) {
    and.push({ severity: { in: uniqueSeverities } });
  }
  if (query.since && query.until) {
    and.push({ occurredAt: { gte: query.since, lte: query.until } });
  } else if (query.since) {
    and.push({ occurredAt: { gte: query.since } });
  } else if (query.until) {
    and.push({ occurredAt: { lte: query.until } });
  }
  if (cursor) {
    const cursorDate = new Date(cursor.occurredAt);
    and.push({
      OR: [
        { occurredAt: { lt: cursorDate } },
        { AND: [{ occurredAt: cursorDate }, { id: { lt: cursor.id } }] },
      ],
    });
  }

  const stateExcl = buildUserStateExclusion(userId, {
    includeDismissed: query.includeDismissed === true,
    unreadOnly: query.unreadOnly === true,
  });
  if (stateExcl) and.push(stateExcl);

  return { AND: and };
}

function toDto(
  row: EventRow,
  companyName: string | null,
  thesisRelevance: ThesisRelevanceDto | null
): WatchtowerEventDto {
  const state = row.userStates[0] ?? null;
  const significance = parseSignificance(row.evidenceJson);
  return {
    id: row.id,
    symbol: row.symbol,
    companyName,
    category: row.category,
    eventType: row.eventType,
    severity: row.severity,
    title: row.title,
    summary: row.summary,
    occurredAt: row.occurredAt.toISOString(),
    detectedAt: row.detectedAt.toISOString(),
    significance,
    source: {
      type: row.sourceType,
      id: row.sourceId,
      url: row.sourceUrl,
    },
    evidence: publicEvidence(row.evidenceJson),
    thesisRelevance,
    readState: {
      isRead: Boolean(state?.readAt),
      readAt: state?.readAt?.toISOString() ?? null,
      isDismissed: Boolean(state?.dismissedAt),
      dismissedAt: state?.dismissedAt?.toISOString() ?? null,
    },
  };
}

async function loadThesisConditionsBySymbol(
  userId: string,
  symbols: string[]
): Promise<Map<string, ThesisConditionOverlayInput[]>> {
  const out = new Map<string, ThesisConditionOverlayInput[]>();
  if (!symbols.length) return out;
  const theses = await prisma.investmentThesis.findMany({
    where: {
      userId,
      symbol: { in: symbols },
      status: { not: "archived" },
    },
    select: {
      symbol: true,
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
  for (const t of theses) {
    out.set(
      t.symbol,
      t.conditions.map((c) => ({
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
      }))
    );
  }
  return out;
}

export async function getWatchtowerFeed(
  userId: string,
  query: WatchtowerFeedQuery
): Promise<
  | { ok: true; result: WatchtowerFeedResult }
  | { ok: false; code: "INVALID_CURSOR"; error: string }
> {
  const monitored = await listMonitoredSymbolsForUser(userId);
  const emptyMeta = {
    monitoredSymbolCount: monitored.length,
    monitoredSymbols: monitored,
    limit: query.limit,
    includeDismissed: query.includeDismissed === true,
    unreadOnly: query.unreadOnly === true,
  };

  if (monitored.length === 0) {
    return {
      ok: true,
      result: { items: [], nextCursor: null, meta: emptyMeta },
    };
  }

  // Symbol filter must be a subset of monitored — never expand beyond portfolio.
  let symbols = monitored;
  if (query.symbol?.length) {
    const allowed = new Set(monitored);
    symbols = query.symbol.filter((s) => allowed.has(s));
    if (symbols.length === 0) {
      return {
        ok: true,
        result: { items: [], nextCursor: null, meta: emptyMeta },
      };
    }
  }

  let cursor = null as ReturnType<typeof decodeWatchtowerCursor>;
  if (query.cursor) {
    cursor = decodeWatchtowerCursor(query.cursor);
    if (!cursor) {
      return {
        ok: false,
        code: "INVALID_CURSOR",
        error: "Invalid pagination cursor",
      };
    }
  }

  const where = buildEventWhere({
    symbols,
    query,
    cursor,
    userId,
  });

  const limit = query.limit;
  const rows = (await prisma.companyEvent.findMany({
    where,
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: {
      ...EVENT_SELECT,
      userStates: {
        where: { userId },
        select: { readAt: true, dismissedAt: true },
        take: 1,
      },
    },
  })) as EventRow[];

  const page = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeWatchtowerCursor({
          occurredAt: last.occurredAt.toISOString(),
          id: last.id,
        })
      : null;

  const pageSymbols = [...new Set(page.map((r) => r.symbol))];
  const masters =
    pageSymbols.length > 0
      ? await prisma.symbolMaster.findMany({
          where: { symbol: { in: pageSymbols } },
          select: { symbol: true, name: true },
        })
      : [];
  const nameBySym = new Map(masters.map((m) => [m.symbol, m.name]));
  const conditionsBySymbol = await loadThesisConditionsBySymbol(
    userId,
    pageSymbols
  );

  const items = page.map((row) => {
    const conds = conditionsBySymbol.get(row.symbol) ?? [];
    const thesisRelevance = conds.length
      ? overlayWatchtowerThesisRelevance({
          event: {
            eventType: row.eventType,
            category: row.category,
            title: row.title,
          },
          conditions: conds,
        })
      : null;
    return toDto(row, nameBySym.get(row.symbol) ?? null, thesisRelevance);
  });

  return {
    ok: true,
    result: {
      items,
      nextCursor,
      meta: {
        ...emptyMeta,
        monitoredSymbols: monitored,
      },
    },
  };
}

export type WatchtowerStateMutationResult =
  | { ok: true; eventId: string; readState: WatchtowerEventDto["readState"] }
  | {
      ok: false;
      code: "NOT_FOUND" | "NOT_MONITORED" | "INVALID";
      error: string;
    };

/**
 * Ensure the event is in this user's portfolio before mutating private state.
 * Shared CompanyEvent rows are global; read/dismiss rows are user-scoped.
 */
async function assertEventInMonitoredPortfolio(
  userId: string,
  eventId: string,
  monitoredSet?: Set<string>
): Promise<
  | { ok: true; event: { id: string; symbol: string } }
  | { ok: false; code: "NOT_FOUND" | "NOT_MONITORED"; error: string }
> {
  const event = await prisma.companyEvent.findUnique({
    where: { id: eventId },
    select: { id: true, symbol: true },
  });
  if (!event) {
    return { ok: false, code: "NOT_FOUND", error: "Event not found" };
  }

  if (monitoredSet) {
    if (!monitoredSet.has(event.symbol)) {
      return {
        ok: false,
        code: "NOT_MONITORED",
        error: "Event is not in your monitored portfolio",
      };
    }
    return { ok: true, event };
  }

  const membership = await prisma.portfolioItem.findFirst({
    where: {
      userId,
      symbol: event.symbol,
      archivedAt: null,
    },
    select: { id: true },
  });
  if (!membership) {
    return {
      ok: false,
      code: "NOT_MONITORED",
      error: "Event is not in your monitored portfolio",
    };
  }
  return { ok: true, event };
}

function resolveStateTimestamps(
  existing: { readAt: Date | null; dismissedAt: Date | null } | null,
  body: { read?: boolean; dismissed?: boolean }
): { readAt: Date | null; dismissedAt: Date | null } {
  const now = new Date();
  let readAt = existing?.readAt ?? null;
  let dismissedAt = existing?.dismissedAt ?? null;

  if (body.read === true) readAt = now;
  if (body.read === false) readAt = null;
  if (body.dismissed === true) {
    dismissedAt = now;
    if (readAt == null) readAt = now;
  }
  if (body.dismissed === false) dismissedAt = null;

  return { readAt, dismissedAt };
}

export async function updateWatchtowerEventState(
  userId: string,
  eventId: string,
  body: { read?: boolean; dismissed?: boolean; opened?: boolean },
  monitoredSet?: Set<string>
): Promise<WatchtowerStateMutationResult> {
  const gate = await assertEventInMonitoredPortfolio(
    userId,
    eventId,
    monitoredSet
  );
  if (!gate.ok) return gate;

  const existing = await prisma.userCompanyEventState.findUnique({
    where: {
      userId_companyEventId: { userId, companyEventId: eventId },
    },
    select: { readAt: true, dismissedAt: true },
  });

  if (body.read === undefined && body.dismissed === undefined) {
    return {
      ok: true,
      eventId,
      readState: {
        isRead: Boolean(existing?.readAt),
        readAt: existing?.readAt?.toISOString() ?? null,
        isDismissed: Boolean(existing?.dismissedAt),
        dismissedAt: existing?.dismissedAt?.toISOString() ?? null,
      },
    };
  }

  const { readAt, dismissedAt } = resolveStateTimestamps(existing, body);

  const row = await prisma.userCompanyEventState.upsert({
    where: {
      userId_companyEventId: { userId, companyEventId: eventId },
    },
    create: {
      userId,
      companyEventId: eventId,
      readAt,
      dismissedAt,
    },
    update: { readAt, dismissedAt },
    select: { readAt: true, dismissedAt: true },
  });

  return {
    ok: true,
    eventId,
    readState: {
      isRead: Boolean(row.readAt),
      readAt: row.readAt?.toISOString() ?? null,
      isDismissed: Boolean(row.dismissedAt),
      dismissedAt: row.dismissedAt?.toISOString() ?? null,
    },
  };
}

export async function batchUpdateWatchtowerEventState(
  userId: string,
  opts: {
    eventIds: string[];
    read?: boolean;
    dismissed?: boolean;
  }
): Promise<{
  updated: string[];
  skipped: { eventId: string; code: string }[];
}> {
  const uniqueIds = [...new Set(opts.eventIds)];
  const [events, monitored] = await Promise.all([
    prisma.companyEvent.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, symbol: true },
    }),
    listMonitoredSymbolsForUser(userId),
  ]);
  const byId = new Map(events.map((e) => [e.id, e]));
  const monitoredSet = new Set(monitored);

  const updated: string[] = [];
  const skipped: { eventId: string; code: string }[] = [];

  // Eligible ids only — then one findMany for existing states + parallel upserts.
  const eligible: string[] = [];
  for (const eventId of uniqueIds) {
    const ev = byId.get(eventId);
    if (!ev) {
      skipped.push({ eventId, code: "NOT_FOUND" });
      continue;
    }
    if (!monitoredSet.has(ev.symbol)) {
      skipped.push({ eventId, code: "NOT_MONITORED" });
      continue;
    }
    eligible.push(eventId);
  }

  if (eligible.length === 0) {
    return { updated, skipped };
  }

  const existingRows = await prisma.userCompanyEventState.findMany({
    where: { userId, companyEventId: { in: eligible } },
    select: {
      companyEventId: true,
      readAt: true,
      dismissedAt: true,
    },
  });
  const existingByEvent = new Map(
    existingRows.map((r) => [r.companyEventId, r])
  );

  await Promise.all(
    eligible.map(async (eventId) => {
      const existing = existingByEvent.get(eventId) ?? null;
      const { readAt, dismissedAt } = resolveStateTimestamps(existing, {
        read: opts.read,
        dismissed: opts.dismissed,
      });
      await prisma.userCompanyEventState.upsert({
        where: {
          userId_companyEventId: { userId, companyEventId: eventId },
        },
        create: {
          userId,
          companyEventId: eventId,
          readAt,
          dismissedAt,
        },
        update: { readAt, dismissedAt },
      });
      updated.push(eventId);
    })
  );

  return { updated, skipped };
}
