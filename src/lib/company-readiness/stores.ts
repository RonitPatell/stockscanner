import { randomBytes } from "node:crypto";
import type {
  CompanyDataset,
  DatasetStateRow,
  DatasetStatus,
  HydrationJobRow,
  HydrationJobStatus,
} from "./types.ts";

export type DatasetStateStore = {
  get(symbol: string, dataset: CompanyDataset): Promise<DatasetStateRow | null>;
  list(symbol: string): Promise<DatasetStateRow[]>;
  upsert(
    row: Omit<DatasetStateRow, "attemptCount"> & { attemptCount?: number }
  ): Promise<DatasetStateRow>;
};

export type HydrationJobStore = {
  get(symbol: string): Promise<HydrationJobRow | null>;
  upsertEnqueue(opts: {
    symbol: string;
    userId?: string | null;
    now: Date;
  }): Promise<{ row: HydrationJobRow; created: boolean }>;
  tryLock(opts: {
    symbol: string;
    token: string;
    now: Date;
    staleMs: number;
  }): Promise<HydrationJobRow | null>;
  claimNext(opts: {
    token: string;
    now: Date;
    staleMs: number;
  }): Promise<HydrationJobRow | null>;
  complete(opts: {
    symbol: string;
    status: HydrationJobStatus;
    now: Date;
    nextEligibleAt: Date;
    lastErrorSummary?: string | null;
  }): Promise<void>;
};

export function newLockToken(): string {
  return randomBytes(16).toString("hex");
}

export function createMemoryReadinessStores(): {
  datasets: DatasetStateStore;
  jobs: HydrationJobStore;
} {
  const datasetMap = new Map<string, DatasetStateRow>();
  const jobs = new Map<string, HydrationJobRow>();

  const dk = (symbol: string, dataset: string) => `${symbol}:${dataset}`;

  const datasetStore: DatasetStateStore = {
    async get(symbol, dataset) {
      const hit = datasetMap.get(dk(symbol, dataset));
      return hit ? { ...hit } : null;
    },
    async list(symbol) {
      return [...datasetMap.values()]
        .filter((r) => r.symbol === symbol)
        .map((r) => ({ ...r }));
    },
    async upsert(row) {
      const prev = datasetMap.get(dk(row.symbol, row.dataset));
      const next: DatasetStateRow = {
        ...row,
        attemptCount: row.attemptCount ?? (prev?.attemptCount ?? 0),
      };
      datasetMap.set(dk(row.symbol, row.dataset), next);
      return { ...next };
    },
  };

  const jobStore: HydrationJobStore = {
    async get(symbol) {
      const hit = jobs.get(symbol);
      return hit ? { ...hit } : null;
    },
    async upsertEnqueue({ symbol, userId, now }) {
      const prev = jobs.get(symbol);
      if (prev && (prev.status === "PENDING" || prev.status === "RUNNING")) {
        const next = {
          ...prev,
          requestedAt: now,
          requestedByUserId: userId ?? prev.requestedByUserId,
        };
        jobs.set(symbol, next);
        return { row: { ...next }, created: false };
      }
      if (prev && prev.nextEligibleAt > now) {
        return { row: { ...prev }, created: false };
      }
      const row: HydrationJobRow = {
        symbol,
        status: "PENDING",
        lockToken: null,
        lockedAt: null,
        attemptCount: prev?.attemptCount ?? 0,
        nextEligibleAt: now,
        requestedAt: now,
        lastAttemptAt: prev?.lastAttemptAt ?? null,
        lastSuccessAt: prev?.lastSuccessAt ?? null,
        lastErrorSummary: null,
        requestedByUserId: userId ?? prev?.requestedByUserId ?? null,
      };
      jobs.set(symbol, row);
      return { row: { ...row }, created: !prev };
    },
    async tryLock({ symbol, token, now, staleMs }) {
      const prev = jobs.get(symbol);
      if (!prev) return null;
      const stale =
        prev.status === "RUNNING" &&
        prev.lockedAt &&
        now.getTime() - prev.lockedAt.getTime() > staleMs;
      if (prev.status === "RUNNING" && !stale) return null;
      if (prev.status !== "PENDING" && !stale) {
        if (prev.nextEligibleAt > now) return null;
        if (prev.status === "SUCCEEDED") return null;
      }
      const row: HydrationJobRow = {
        ...prev,
        status: "RUNNING",
        lockToken: token,
        lockedAt: now,
        lastAttemptAt: now,
        attemptCount: prev.attemptCount + 1,
      };
      jobs.set(symbol, row);
      return { ...row };
    },
    async claimNext({ token, now, staleMs }) {
      const candidates = [...jobs.values()].filter((j) => {
        if (j.nextEligibleAt > now && j.status !== "RUNNING") return false;
        if (j.status === "PENDING") return true;
        if (
          j.status === "RUNNING" &&
          j.lockedAt &&
          now.getTime() - j.lockedAt.getTime() > staleMs
        ) {
          return true;
        }
        return false;
      });
      candidates.sort((a, b) => a.requestedAt.getTime() - b.requestedAt.getTime());
      const first = candidates[0];
      if (!first) return null;
      return jobStore.tryLock({ symbol: first.symbol, token, now, staleMs });
    },
    async complete({ symbol, status, now, nextEligibleAt, lastErrorSummary }) {
      const prev = jobs.get(symbol);
      if (!prev) return;
      jobs.set(symbol, {
        ...prev,
        status,
        lockToken: null,
        lockedAt: null,
        lastSuccessAt:
          status === "SUCCEEDED" || status === "PARTIAL" ? now : prev.lastSuccessAt,
        lastErrorSummary: lastErrorSummary ?? null,
        nextEligibleAt,
      });
    },
  };

  return { datasets: datasetStore, jobs: jobStore };
}

export function backoffMs(attemptCount: number): number {
  const base = 15 * 60_000;
  const capped = Math.min(12 * 3600_000, base * 2 ** Math.max(0, attemptCount - 1));
  return capped;
}

export function sanitizeErrorSummary(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "hydration_failed";
  return raw
    .replace(/postgres:\/\/\S+/gi, "[redacted]")
    .replace(/DATABASE_URL=\S+/gi, "[redacted]")
    .replace(/CRON_SECRET=\S+/gi, "[redacted]")
    .replace(/password=\S+/gi, "[redacted]")
    .slice(0, 180);
}

export function asDatasetStatus(v: string): DatasetStatus {
  if (
    v === "READY" ||
    v === "STALE" ||
    v === "MISSING" ||
    v === "PROCESSING" ||
    v === "UNSUPPORTED" ||
    v === "ERROR"
  ) {
    return v;
  }
  return "MISSING";
}
