export {
  ANALOGUE_ENGINE_VERSION,
  ANALOGUE_METHODOLOGY,
} from "./version.ts";
export * from "./types.ts";
export {
  priceBucket,
  rvolBucket,
  gapBucket,
  implicationFromInputs,
  dilutionStatusFromInputs,
  subtypeFromHeadline,
  floatBucket,
  liquidityBucket,
  sessionAt,
} from "./buckets.ts";
export {
  adjustPriceForSplits,
  resolveSymbolAsOf,
  isCorruptCandlePath,
  type CorporateActionFactor,
} from "./corporate-actions.ts";
export {
  buildFeatureVector,
  buildEventOutcome,
  isBeforeQuery,
} from "./features.ts";
export {
  matchCandidate,
  findAnalogues,
  evaluateDimensions,
  loosenCriteria,
  tightenCriteria,
  criteriaPreset,
} from "./match.ts";
export { aggregateAnalogueStats } from "./metrics.ts";
export { buildAnalogueReport } from "./report.ts";
export { detectAnalogueBias } from "./bias.ts";
export {
  getAnalogueReportForCatalyst,
  getAnalogueBiasReport,
} from "./service.ts";
