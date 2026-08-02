/**
 * Admin shadow compare: candidate engine vs production on the same frames.
 * Does not mutate user-facing output — comparison only.
 */

import type { MonitorReplayFrame } from "../replay/types.ts";
import { meanWithCI, proportionWithCI, type MeanCI, type ProportionCI } from "./stats.ts";
import { MONITOR_CALIBRATION_VERSION } from "./version.ts";

export interface ShadowFramePair {
  asOfMs: number;
  symbol: string;
  production: {
    intensity: number | null;
    state: string | null;
    priority: number | null;
    rank: number | null;
  };
  candidate: {
    intensity: number | null;
    state: string | null;
    priority: number | null;
    rank: number | null;
  };
}

export interface ShadowCompareReport {
  version: string;
  productionEngine: string;
  candidateEngine: string;
  pairs: number;
  stateAgreement: ProportionCI;
  intensityAbsDelta: MeanCI;
  rankAbsDelta: MeanCI;
  priorityAbsDelta: MeanCI;
  /** Symbols where candidate rank=1 and production rank≠1 (or vice versa) */
  leaderDisagreement: ProportionCI;
  userOutputUnchanged: true;
  note: string;
}

export function compareShadowPairs(opts: {
  productionEngine: string;
  candidateEngine: string;
  pairs: ShadowFramePair[];
}): ShadowCompareReport {
  const { pairs } = opts;
  let stateAgree = 0;
  let leaderDisagree = 0;
  const intensityDeltas: number[] = [];
  const rankDeltas: number[] = [];
  const priorityDeltas: number[] = [];

  for (const p of pairs) {
    if (p.production.state === p.candidate.state) stateAgree += 1;
    const pi = p.production.intensity;
    const ci = p.candidate.intensity;
    if (pi != null && ci != null) intensityDeltas.push(Math.abs(ci - pi));
    const pr = p.production.rank;
    const cr = p.candidate.rank;
    if (pr != null && cr != null) {
      rankDeltas.push(Math.abs(cr - pr));
      const prodLeader = pr === 1;
      const candLeader = cr === 1;
      if (prodLeader !== candLeader) leaderDisagree += 1;
    }
    const pp = p.production.priority;
    const cp = p.candidate.priority;
    if (pp != null && cp != null) priorityDeltas.push(Math.abs(cp - pp));
  }

  return {
    version: MONITOR_CALIBRATION_VERSION,
    productionEngine: opts.productionEngine,
    candidateEngine: opts.candidateEngine,
    pairs: pairs.length,
    stateAgreement: proportionWithCI(stateAgree, pairs.length),
    intensityAbsDelta: meanWithCI(intensityDeltas),
    rankAbsDelta: meanWithCI(rankDeltas),
    priorityAbsDelta: meanWithCI(priorityDeltas),
    leaderDisagreement: proportionWithCI(leaderDisagree, pairs.length),
    userOutputUnchanged: true,
    note: "Shadow compare only — production user output is not switched.",
  };
}

/** Build pairs from two frame lists aligned by (symbol, asOfMs). */
export function alignFramesForShadow(
  production: MonitorReplayFrame[],
  candidate: MonitorReplayFrame[]
): ShadowFramePair[] {
  const candKey = new Map<string, MonitorReplayFrame>();
  for (const f of candidate) {
    candKey.set(`${f.symbol}|${f.asOfMs}`, f);
  }
  const pairs: ShadowFramePair[] = [];
  for (const p of production) {
    const c = candKey.get(`${p.symbol}|${p.asOfMs}`);
    if (!c) continue;
    pairs.push({
      asOfMs: p.asOfMs,
      symbol: p.symbol,
      production: {
        intensity: p.momentum.intensity,
        state: p.momentum.state,
        priority: p.attention.priority,
        rank: p.attention.rank,
      },
      candidate: {
        intensity: c.momentum.intensity,
        state: c.momentum.state,
        priority: c.attention.priority,
        rank: c.attention.rank,
      },
    });
  }
  return pairs;
}
