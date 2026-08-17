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
  try {
    const observations = normalizeCompanyfactsMetrics(opts);
    if (!opts.persist) {
      return { observations, upserted: 0, ids: [] };
    }
    const { upserted, ids } = await persistMetricObservations(observations);
    void import("../ops/index.ts")
      .then(({ recordOpsStamp }) =>
        recordOpsStamp("metrics_normalize_ok", {
          symbol: opts.symbol.toUpperCase(),
          upserted,
        })
      )
      .catch(() => {});
    return { observations, upserted, ids };
  } catch (err) {
    void import("../ops/index.ts")
      .then(({ opsFail, incrOpsCounter }) => {
        opsFail("financial_normalization", "ingest_failed", err, {
          symbol: opts.symbol.toUpperCase(),
        });
        return incrOpsCounter("metrics_normalize_fail");
      })
      .catch(() => {});
    throw err;
  }
}
