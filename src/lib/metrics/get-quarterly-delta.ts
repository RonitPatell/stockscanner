/**
 * SSR / API helper: build Quarterly Delta for a symbol from DB observations.
 */

import { buildQuarterlyDeltaReport } from "./quarterly-delta.ts";
import { loadMetricObservationsForSymbol } from "./load.ts";
import type { QuarterlyDeltaReport } from "./quarterly-delta.ts";

export async function getQuarterlyDeltaForSymbol(
  symbol: string
): Promise<QuarterlyDeltaReport> {
  const observations = await loadMetricObservationsForSymbol(symbol);
  return buildQuarterlyDeltaReport({ symbol, observations });
}
