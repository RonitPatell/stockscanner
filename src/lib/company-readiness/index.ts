export { ensureCompanyReady } from "./ensure.ts";
export type { EnsureCompanyReadyPorts } from "./ensure.ts";
export { hydrateCompanySymbol } from "./hydrate.ts";
export type { HydrateSymbolPorts, HydrateSymbolResult } from "./hydrate.ts";
export { runHydrationCron } from "./cron.ts";
export { buildReadinessDto, deriveDatasetStatus, needsHydration, emptyInspect } from "./derive.ts";
export {
  DATA_HEALTH_REASON_CODES,
  resolveDataHealthReason,
  enrichDatasetHealth,
  enrichReadinessHealth,
  type DataHealthReasonCode,
  type DataHealthResult,
} from "./data-health.ts";
export { bannerCopyFromHealth, overviewEmptyCopy, datasetDisplayName } from "./ui-copy.ts";
export { createMemoryReadinessStores, backoffMs, newLockToken } from "./stores.ts";
export {
  COMPANY_DATASETS,
  DATASET_STATUSES,
  type CompanyDataset,
  type CompanyReadiness,
  type DatasetStatus,
} from "./types.ts";
export {
  parseSubmissionsRecent,
  selectFilingsForHydration,
  submissionsUrlForCik,
} from "./submissions.ts";

import { inspectSymbolDatasets } from "./inspect.ts";
import { createPrismaDatasetStateStore, createPrismaHydrationJobStore } from "./prisma-store.ts";
import type { EnsureCompanyReadyPorts } from "./ensure.ts";
import type { HydrateSymbolPorts } from "./hydrate.ts";

export function productionReadyPorts(): EnsureCompanyReadyPorts {
  return {
    datasets: createPrismaDatasetStateStore(),
    jobs: createPrismaHydrationJobStore(),
    inspect: inspectSymbolDatasets,
  };
}

export function productionHydratePorts(): HydrateSymbolPorts {
  return {
    datasets: createPrismaDatasetStateStore(),
  };
}

export { inspectSymbolDatasets };
