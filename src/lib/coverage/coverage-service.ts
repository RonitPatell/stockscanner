import { prisma } from "../prisma.ts";
import { ACTIVE_US_TICKERS } from "../news-sources/active-tickers.ts";
import {
  COVERAGE_REASON_HINTS,
  COVERAGE_REASON_LABELS,
  coverageTtlHours,
  isCoverageReason,
  isTemporaryReason,
  type CoverageReason,
} from "./types.ts";

export interface CoverageBadge {
  symbol: string;
  reason: CoverageReason;
  label: string;
  hint: string;
  temporary: boolean;
  expiresAt: string | null;
}

export async function upsertCoverage(opts: {
  symbol: string;
  reason: CoverageReason;
  note?: string;
  /** Force permanent even for temporary reasons */
  permanent?: boolean;
}): Promise<void> {
  const symbol = opts.symbol.trim().toUpperCase();
  if (!/^[A-Z]{1,5}$/.test(symbol)) return;

  const temporary = opts.permanent ? false : isTemporaryReason(opts.reason);
  const hours = coverageTtlHours(opts.reason);
  const expiresAt =
    temporary && hours > 0 ? new Date(Date.now() + hours * 3600_000) : null;

  await prisma.symbolCoverage.upsert({
    where: {
      symbol_reason: { symbol, reason: opts.reason },
    },
    create: {
      symbol,
      reason: opts.reason,
      temporary,
      expiresAt,
      note: opts.note?.slice(0, 120) ?? null,
    },
    update: {
      temporary,
      expiresAt,
      note: opts.note?.slice(0, 120) ?? undefined,
      updatedAt: new Date(),
    },
  });
}

export async function expireStaleCoverage(): Promise<number> {
  const res = await prisma.symbolCoverage.deleteMany({
    where: {
      temporary: true,
      expiresAt: { lt: new Date() },
    },
  });
  return res.count;
}

/** Active coverage symbols for polling (DB + curated core fallback). */
export async function getActiveCoverageSymbols(limit = 200): Promise<string[]> {
  const now = new Date();
  const rows = await prisma.symbolCoverage.findMany({
    where: {
      OR: [{ temporary: false }, { expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { symbol: true },
    take: limit * 2,
  });
  const set = new Set<string>([
    ...ACTIVE_US_TICKERS.slice(0, 40),
    ...rows.map((r) => r.symbol.toUpperCase()),
  ]);
  return [...set].slice(0, limit);
}

export async function getCoverageBadges(symbol: string): Promise<CoverageBadge[]> {
  const now = new Date();
  const rows = await prisma.symbolCoverage.findMany({
    where: {
      symbol: symbol.toUpperCase(),
      OR: [{ temporary: false }, { expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { updatedAt: "desc" },
  });

  return rows
    .filter((r) => isCoverageReason(r.reason))
    .map((r) => {
      const reason = r.reason as CoverageReason;
      return {
        symbol: r.symbol,
        reason,
        label: COVERAGE_REASON_LABELS[reason],
        hint: COVERAGE_REASON_HINTS[reason],
        temporary: r.temporary,
        expiresAt: r.expiresAt?.toISOString() ?? null,
      };
    });
}

export async function primaryCoverageReason(
  symbol: string
): Promise<CoverageReason | null> {
  const badges = await getCoverageBadges(symbol);
  if (badges.length === 0) return null;
  const priority: CoverageReason[] = [
    "USER_WATCHLIST",
    "FRESH_SEC_FILING",
    "RECENT_HALT",
    "ACTIVE_GAINER",
    "UNUSUAL_VOLUME",
    "FRESH_NEWS",
    "CURATED_CORE",
    "MANUAL",
  ];
  for (const p of priority) {
    const hit = badges.find((b) => b.reason === p);
    if (hit) return hit.reason;
  }
  return badges[0].reason;
}

/** Ensure curated core rows exist (idempotent). */
export async function ensureCuratedCoreCoverage(): Promise<void> {
  for (const symbol of ACTIVE_US_TICKERS) {
    await upsertCoverage({
      symbol,
      reason: "CURATED_CORE",
      permanent: true,
      note: "static curated rotation",
    }).catch(() => {});
  }
}

export async function syncWatchlistCoverage(symbols: string[]): Promise<void> {
  for (const s of symbols) {
    await upsertCoverage({
      symbol: s,
      reason: "USER_WATCHLIST",
      permanent: true,
    }).catch(() => {});
  }
}

/**
 * Promote temporary coverage from market activity.
 * Halts only from news/headline signals — we do not have an exchange halt feed.
 */
export async function promoteTemporaryCoverage(input: {
  symbol: string;
  reason: Extract<
    CoverageReason,
    | "ACTIVE_GAINER"
    | "UNUSUAL_VOLUME"
    | "RECENT_HALT"
    | "FRESH_SEC_FILING"
    | "FRESH_NEWS"
  >;
  note?: string;
}): Promise<void> {
  await upsertCoverage({
    symbol: input.symbol,
    reason: input.reason,
    note: input.note,
  });
}
