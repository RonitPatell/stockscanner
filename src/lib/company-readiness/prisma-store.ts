import { prisma } from "../prisma.ts";
import type {
  CompanyDataset,
  DatasetStateRow,
  HydrationJobRow,
  HydrationJobStatus,
} from "./types.ts";
import { asDatasetStatus, type DatasetStateStore, type HydrationJobStore } from "./stores.ts";

/** Delegates exist after `prisma generate`; typed locally so a locked Windows generate still typechecks. */
type DatasetRowDto = {
  symbol: string;
  dataset: string;
  status: string;
  lastAttemptAt: Date | null;
  lastSuccessAt: Date | null;
  dataAsOf: Date | null;
  nextEligibleAt: Date | null;
  rowCount: number | null;
  attemptCount: number;
  lastErrorCode: string | null;
  lastErrorSummary: string | null;
};

type JobRowDto = {
  symbol: string;
  status: string;
  lockToken: string | null;
  lockedAt: Date | null;
  attemptCount: number;
  nextEligibleAt: Date;
  requestedAt: Date;
  lastAttemptAt: Date | null;
  lastSuccessAt: Date | null;
  lastErrorSummary: string | null;
  requestedByUserId: string | null;
};

function datasetDelegate() {
  return (prisma as unknown as {
    companyDatasetState: {
      findUnique: (args: unknown) => Promise<DatasetRowDto | null>;
      findMany: (args: unknown) => Promise<DatasetRowDto[]>;
      upsert: (args: unknown) => Promise<DatasetRowDto>;
    };
  }).companyDatasetState;
}

function jobDelegate() {
  return (prisma as unknown as {
    companyHydrationJob: {
      findUnique: (args: unknown) => Promise<JobRowDto | null>;
      findFirst: (args: unknown) => Promise<JobRowDto | null>;
      upsert: (args: unknown) => Promise<JobRowDto>;
      update: (args: unknown) => Promise<JobRowDto>;
      updateMany: (args: unknown) => Promise<{ count: number }>;
    };
  }).companyHydrationJob;
}

function toDataset(row: {
  symbol: string;
  dataset: string;
  status: string;
  lastAttemptAt: Date | null;
  lastSuccessAt: Date | null;
  dataAsOf: Date | null;
  nextEligibleAt: Date | null;
  rowCount: number | null;
  attemptCount: number;
  lastErrorCode: string | null;
  lastErrorSummary: string | null;
}): DatasetStateRow {
  return {
    symbol: row.symbol,
    dataset: row.dataset as CompanyDataset,
    status: asDatasetStatus(row.status),
    lastAttemptAt: row.lastAttemptAt,
    lastSuccessAt: row.lastSuccessAt,
    dataAsOf: row.dataAsOf,
    nextEligibleAt: row.nextEligibleAt,
    rowCount: row.rowCount,
    attemptCount: row.attemptCount,
    lastErrorCode: row.lastErrorCode,
    lastErrorSummary: row.lastErrorSummary,
  };
}

function toJob(row: {
  symbol: string;
  status: string;
  lockToken: string | null;
  lockedAt: Date | null;
  attemptCount: number;
  nextEligibleAt: Date;
  requestedAt: Date;
  lastAttemptAt: Date | null;
  lastSuccessAt: Date | null;
  lastErrorSummary: string | null;
  requestedByUserId: string | null;
}): HydrationJobRow {
  return {
    symbol: row.symbol,
    status: row.status as HydrationJobStatus,
    lockToken: row.lockToken,
    lockedAt: row.lockedAt,
    attemptCount: row.attemptCount,
    nextEligibleAt: row.nextEligibleAt,
    requestedAt: row.requestedAt,
    lastAttemptAt: row.lastAttemptAt,
    lastSuccessAt: row.lastSuccessAt,
    lastErrorSummary: row.lastErrorSummary,
    requestedByUserId: row.requestedByUserId,
  };
}

export function createPrismaDatasetStateStore(): DatasetStateStore {
  return {
    async get(symbol, dataset) {
      const row = await datasetDelegate().findUnique({
        where: { symbol_dataset: { symbol, dataset } },
      });
      return row ? toDataset(row) : null;
    },
    async list(symbol) {
      const rows = await datasetDelegate().findMany({ where: { symbol } });
      return rows.map(toDataset);
    },
    async upsert(row) {
      const saved = await datasetDelegate().upsert({
        where: { symbol_dataset: { symbol: row.symbol, dataset: row.dataset } },
        create: {
          symbol: row.symbol,
          dataset: row.dataset,
          status: row.status,
          lastAttemptAt: row.lastAttemptAt,
          lastSuccessAt: row.lastSuccessAt,
          dataAsOf: row.dataAsOf,
          nextEligibleAt: row.nextEligibleAt,
          rowCount: row.rowCount,
          attemptCount: row.attemptCount ?? 0,
          lastErrorCode: row.lastErrorCode,
          lastErrorSummary: row.lastErrorSummary,
        },
        update: {
          status: row.status,
          lastAttemptAt: row.lastAttemptAt,
          lastSuccessAt: row.lastSuccessAt,
          dataAsOf: row.dataAsOf,
          nextEligibleAt: row.nextEligibleAt,
          rowCount: row.rowCount,
          attemptCount: row.attemptCount,
          lastErrorCode: row.lastErrorCode,
          lastErrorSummary: row.lastErrorSummary,
        },
      });
      return toDataset(saved);
    },
  };
}

export function createPrismaHydrationJobStore(): HydrationJobStore {
  return {
    async get(symbol) {
      const row = await jobDelegate().findUnique({ where: { symbol } });
      return row ? toJob(row) : null;
    },
    async upsertEnqueue({ symbol, userId, now }) {
      const prev = await jobDelegate().findUnique({ where: { symbol } });
      if (prev && (prev.status === "PENDING" || prev.status === "RUNNING")) {
        const row = await jobDelegate().update({
          where: { symbol },
          data: {
            requestedAt: now,
            requestedByUserId: userId ?? prev.requestedByUserId,
          },
        });
        return { row: toJob(row), created: false };
      }
      if (prev && prev.nextEligibleAt > now) {
        return { row: toJob(prev), created: false };
      }
      const row = await jobDelegate().upsert({
        where: { symbol },
        create: {
          symbol,
          status: "PENDING",
          nextEligibleAt: now,
          requestedAt: now,
          requestedByUserId: userId ?? null,
        },
        update: {
          status: "PENDING",
          lockToken: null,
          lockedAt: null,
          nextEligibleAt: now,
          requestedAt: now,
          lastErrorSummary: null,
          requestedByUserId: userId ?? undefined,
        },
      });
      return { row: toJob(row), created: !prev };
    },
    async tryLock({ symbol, token, now, staleMs }) {
      const staleBefore = new Date(now.getTime() - staleMs);
      const res = await jobDelegate().updateMany({
        where: {
          symbol,
          OR: [
            { status: "PENDING", nextEligibleAt: { lte: now } },
            { status: "RUNNING", lockedAt: { lte: staleBefore } },
            { status: "FAILED", nextEligibleAt: { lte: now } },
            { status: "PARTIAL", nextEligibleAt: { lte: now } },
          ],
        },
        data: {
          status: "RUNNING",
          lockToken: token,
          lockedAt: now,
          lastAttemptAt: now,
          attemptCount: { increment: 1 },
        },
      });
      if (res.count === 0) return null;
      const row = await jobDelegate().findUnique({ where: { symbol } });
      return row ? toJob(row) : null;
    },
    async claimNext({ token, now, staleMs }) {
      const staleBefore = new Date(now.getTime() - staleMs);
      const next = await jobDelegate().findFirst({
        where: {
          OR: [
            { status: "PENDING", nextEligibleAt: { lte: now } },
            { status: "RUNNING", lockedAt: { lte: staleBefore } },
            { status: "FAILED", nextEligibleAt: { lte: now } },
            { status: "PARTIAL", nextEligibleAt: { lte: now } },
          ],
        },
        orderBy: { requestedAt: "asc" },
      });
      if (!next) return null;
      return this.tryLock({ symbol: next.symbol, token, now, staleMs });
    },
    async complete({ symbol, status, now, nextEligibleAt, lastErrorSummary }) {
      await jobDelegate().update({
        where: { symbol },
        data: {
          status,
          lockToken: null,
          lockedAt: null,
          nextEligibleAt,
          lastErrorSummary: lastErrorSummary ?? null,
          lastSuccessAt:
            status === "SUCCEEDED" || status === "PARTIAL" ? now : undefined,
        },
      });
    },
  };
}
