import { mapPool } from "../cost/map-pool.ts";
import { backoffMs, newLockToken, type HydrationJobStore } from "./stores.ts";
import { hydrateCompanySymbol, type HydrateSymbolPorts } from "./hydrate.ts";
import type { HydrationJobStatus } from "./types.ts";

const STALE_LOCK_MS = 2 * 60_000;

export async function runHydrationCron(opts: {
  jobs: HydrationJobStore;
  hydratePorts: Omit<HydrateSymbolPorts, "now">;
  limit?: number;
  concurrency?: number;
  deadlineMs?: number;
  now?: Date;
}): Promise<{ claimed: number; succeeded: number; failed: number; truncated: boolean }> {
  const limit = Math.min(4, Math.max(1, opts.limit ?? 2));
  const concurrency = Math.min(2, Math.max(1, opts.concurrency ?? 1));
  const now = opts.now ?? new Date();
  const deadlineMs = opts.deadlineMs ?? Date.now() + 50_000;
  let truncated = false;
  const claimed: string[] = [];

  for (let i = 0; i < limit; i++) {
    if (Date.now() >= deadlineMs) {
      truncated = true;
      break;
    }
    const token = newLockToken();
    const job = await opts.jobs.claimNext({ token, now, staleMs: STALE_LOCK_MS });
    if (!job) break;
    claimed.push(job.symbol);
  }

  let succeeded = 0;
  let failed = 0;

  await mapPool(claimed, concurrency, async (symbol) => {
    if (Date.now() >= deadlineMs) {
      truncated = true;
      return;
    }
    try {
      const result = await hydrateCompanySymbol(symbol, {
        ...opts.hydratePorts,
        now,
      });
      const datasetFails = [
        result.financials,
        result.filings,
        result.insiders,
        result.ownership,
        result.capital,
      ].filter((s) => s === "ERROR").length;
      const status: HydrationJobStatus =
        datasetFails === 0
          ? "SUCCEEDED"
          : datasetFails >= 4
            ? "FAILED"
            : "PARTIAL";
      await opts.jobs.complete({
        symbol,
        status,
        now,
        nextEligibleAt: new Date(now.getTime() + backoffMs(1)),
        lastErrorSummary: result.errors[0] ?? null,
      });
      if (status === "FAILED") failed += 1;
      else succeeded += 1;
    } catch (err) {
      failed += 1;
      await opts.jobs.complete({
        symbol,
        status: "FAILED",
        now,
        nextEligibleAt: new Date(now.getTime() + backoffMs(2)),
        lastErrorSummary:
          err instanceof Error ? "Hydration job failed." : "Hydration job failed.",
      });
    }
  });

  return { claimed: claimed.length, succeeded, failed, truncated };
}
