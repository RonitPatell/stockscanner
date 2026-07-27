import { ANALOGUE_ENGINE_VERSION, ANALOGUE_METHODOLOGY } from "./version.ts";
import { aggregateAnalogueStats } from "./metrics.ts";
import {
  criteriaPreset,
  findAnalogues,
  loosenCriteria,
  tightenCriteria,
} from "./match.ts";
import type {
  AnalogueEventOutcome,
  AnalogueFeatureVector,
  AnalogueMatchCriteria,
  AnalogueReport,
} from "./types.ts";
import { ANALOGUE_DISCLAIMER, DEFAULT_CRITERIA } from "./types.ts";

/**
 * Build a full analogue report for a query catalyst against a historical corpus.
 */
export function buildAnalogueReport(opts: {
  query: AnalogueFeatureVector;
  corpus: Array<{
    features: AnalogueFeatureVector;
    outcome: AnalogueEventOutcome;
  }>;
  criteria?: AnalogueMatchCriteria;
  limit?: number;
}): AnalogueReport {
  const criteria = opts.criteria ?? DEFAULT_CRITERIA;
  const found = findAnalogues({
    query: opts.query,
    corpus: opts.corpus,
    criteria,
    limit: opts.limit,
  });

  const looser = findAnalogues({
    query: opts.query,
    corpus: opts.corpus,
    criteria: loosenCriteria(criteria),
    limit: 500,
  });
  const tighter = findAnalogues({
    query: opts.query,
    corpus: opts.corpus,
    criteria: tightenCriteria(criteria),
    limit: 500,
  });

  const stats = aggregateAnalogueStats(found.matches);

  return {
    engineVersion: ANALOGUE_ENGINE_VERSION,
    generatedAt: new Date().toISOString(),
    query: opts.query,
    criteria,
    criteriaPreset: criteriaPreset(criteria),
    candidatesScanned: found.candidatesScanned,
    excludedCount: found.excludedCount,
    matches: found.matches,
    stats,
    sampleSizeIfLooser: looser.matches.length,
    sampleSizeIfTighter: tighter.matches.length,
    methodology: ANALOGUE_METHODOLOGY,
    disclaimer: ANALOGUE_DISCLAIMER,
  };
}
