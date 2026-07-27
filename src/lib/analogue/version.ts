/** Historical Catalyst Analogue Engine — descriptive evidence only. */
export const ANALOGUE_ENGINE_VERSION = "analogue-v1.0";

export const ANALOGUE_METHODOLOGY = {
  version: ANALOGUE_ENGINE_VERSION,
  summary:
    "Comparables are past catalysts matched on category, implication, session, and market-structure buckets using only data available at each historical event time. Distributions describe what prices did after those events — not forecasts.",
  noLookAhead:
    "Only events ingested before the query catalyst’s ingest time are eligible. Horizon returns use snapshots frozen after each historical event; later classification edits do not rewrite historical feature vectors used for matching.",
  adjustments:
    "Split-suspect and corrupted price paths are excluded. Delisted or symbol-changed names may appear when outcomes were captured before delisting; surviving-name bias is flagged in admin tools.",
  disclosures: [
    "Not a prediction, target price, expected profit, or probability of success.",
    "Not personalized trading advice.",
    "Small samples are labelled and should not be treated as conclusive.",
    "Past reactions do not imply future results.",
  ],
} as const;
