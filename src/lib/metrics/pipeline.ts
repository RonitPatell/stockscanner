/**
 * Pipeline: companyfacts → extract → derive → (optional) persist.
 */

import { deriveMetrics } from "./derive.ts";
import { extractMetricsFromCompanyfacts } from "./extract.ts";
import { persistMetricObservations } from "./persist.ts";
import type {
  NormalizedMetricObservation,
  SecCompanyfactsDocument,
} from "./types.ts";

export function normalizeCompanyfactsMetrics(opts: {
  symbol: string;
  doc: SecCompanyfactsDocument;
  cik?: string | null;
}): NormalizedMetricObservation[] {
  const extracted = extractMetricsFromCompanyfacts(opts);
  return deriveMetrics(extracted);
}

export async function ingestCompanyfactsMetrics(opts: {
  symbol: string;
  doc: SecCompanyfactsDocument;
  cik?: string | null;
  persist?: boolean;
}): Promise<{
  observations: NormalizedMetricObservation[];
  upserted: number;
  ids: string[];
}> {
  const observations = normalizeCompanyfactsMetrics(opts);
  if (!opts.persist) {
    return { observations, upserted: 0, ids: [] };
  }
  const { upserted, ids } = await persistMetricObservations(observations);
  return { observations, upserted, ids };
}
