/**
 * ensureCompanyReady(symbol) — identity, coverage, inspect, enqueue.
 * Does not fetch SEC during this call (except identity mapping when CIK is missing).
 */

import { trackRetention } from "../analytics/retention.ts";
import { resolveCompanyIdentity } from "../company-identity/resolve.ts";
import { normalizeSymbol } from "../company-identity/normalize.ts";
import { ensureResearchInterestCoverage } from "../coverage/coverage-service.ts";
import { buildReadinessDto, emptyInspect, needsHydration } from "./derive.ts";
import type { DatasetStateStore, HydrationJobStore } from "./stores.ts";
import type {
  CompanyReadiness,
  EnsureCompanyReadyOptions,
  ReadinessInspect,
} from "./types.ts";

export type EnsureCompanyReadyPorts = {
  datasets: DatasetStateStore;
  jobs: HydrationJobStore;
  inspect?: (symbol: string) => Promise<ReadinessInspect>;
  ensureCoverage?: (symbol: string) => Promise<void>;
  coverageExists?: (symbol: string) => Promise<boolean>;
};

export async function ensureCompanyReady(
  raw: string,
  opts: EnsureCompanyReadyOptions & { ports: EnsureCompanyReadyPorts }
): Promise<CompanyReadiness> {
  const now = opts.now ?? new Date();
  const symbol = normalizeSymbol(raw);
  const enqueue = opts.enqueue !== false;
  const ensureCoverage = opts.ensureCoverage !== false;
  const include13F = Boolean(opts.include13F);
  const { ports } = opts;

  const identity =
    opts.identity ??
    (await resolveCompanyIdentity(raw, { persist: true }));

  if (identity.status === "NOT_FOUND" || !identity.symbol) {
    return buildReadinessDto({
      symbol: symbol || raw.trim().toUpperCase(),
      identity,
      inspect: emptyInspect(),
      job: null,
      states: [],
      covered: false,
      hydrationEnqueued: false,
      now,
      include13F,
    });
  }

  const canonical = identity.symbol;

  if (ensureCoverage && identity.status !== "ERROR") {
    const cover = ports.ensureCoverage ?? ensureResearchInterestCoverage;
    await cover(canonical).catch(() => {});
  }

  const inspect = ports.inspect
    ? await ports.inspect(canonical)
    : emptyInspect();

  const states = await ports.datasets.list(canonical);
  let job = await ports.jobs.get(canonical);

  let hydrationEnqueued = false;
  const preview = buildReadinessDto({
    symbol: canonical,
    identity,
    inspect,
    job,
    states,
    covered: true,
    hydrationEnqueued: false,
    now,
    include13F,
  });

  const shouldQueue =
    enqueue &&
    identity.status === "READY" &&
    needsHydration(preview, include13F, now);

  if (shouldQueue) {
    const backoffBlocked =
      job &&
      job.nextEligibleAt > now &&
      (job.status === "FAILED" || job.status === "SUCCEEDED" || job.status === "PARTIAL");
    if (!backoffBlocked) {
      const queued = await ports.jobs.upsertEnqueue({
        symbol: canonical,
        userId: opts.userId ?? null,
        now,
      });
      job = queued.row;
      hydrationEnqueued =
        queued.row.status === "PENDING" || queued.row.status === "RUNNING";
      if (hydrationEnqueued) {
        void trackRetention("company_hydration_requested", {
          userId: opts.userId ?? null,
          props: { symbol: canonical },
        });
      }
    }
  }

  const covered = ports.coverageExists
    ? await ports.coverageExists(canonical)
    : true;

  return buildReadinessDto({
    symbol: canonical,
    identity,
    inspect,
    job,
    states,
    covered,
    hydrationEnqueued,
    now,
    include13F,
  });
}
