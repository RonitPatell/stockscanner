/**
 * Monitor calibration metrics — descriptive analysis only.
 * Forbidden outputs: predicted profit, expected return, P(win), target price.
 */

import type { MonitorReplayFrame, MonitorReplaySession } from "../replay/types.ts";
import { framesAsOf } from "../replay/record.ts";
import { histogram, meanWithCI, proportionWithCI, type MeanCI, type ProportionCI } from "./stats.ts";
import { MONITOR_CALIBRATION_VERSION } from "./version.ts";

export interface IntensityByState {
  state: string;
  intensity: MeanCI;
  histogram: Record<string, number>;
}

export interface StateDurationRow {
  state: string;
  durationMs: MeanCI;
}

export interface TransitionRow {
  from: string;
  to: string;
  count: number;
}

export interface DescriptiveOutcome {
  /** State exited */
  fromState: string;
  /** Intensity change over next horizonMs — descriptive, not a trade edge */
  intensityDelta: MeanCI;
  horizonMs: number;
  n: number;
}

export interface CalibrationReport {
  version: string;
  sessionId: string;
  sampleFrames: number;
  intensityByState: IntensityByState[];
  stateDuration: StateDurationRow[];
  transitions: TransitionRow[];
  falseOnePrintBreakouts: ProportionCI;
  leaderChurn: {
    leaderChanges: number;
    frames: number;
    churnPerThousandFrames: number;
  };
  staleData: {
    staleFrameShare: ProportionCI;
    /** Approximate ms of session time with stale DQ on any symbol */
    approxStaleMs: number;
  };
  missingQuotes: ProportionCI;
  outcomesAfterState: DescriptiveOutcome[];
  disclaimer: string;
}

const DISCLAIMER =
  "Descriptive calibration only — sample distributions and as-of diagnostics. Not a trading forecast or signal.";

const INTENSITY_BINS = [0, 0.2, 0.4, 0.6, 0.8, 1.0];

export function computeCalibrationReport(
  session: MonitorReplaySession,
  opts?: { outcomeHorizonMs?: number }
): CalibrationReport {
  const horizonMs = opts?.outcomeHorizonMs ?? 60_000;
  const frames = session.frames;
  const bySymbol = groupBySymbol(frames);

  const intensityByState = computeIntensityByState(frames);
  const { durations, transitions, falseBreakouts } = computeStatePathMetrics(bySymbol);
  const leaderChurn = computeLeaderChurn(frames);
  const stale = computeStale(session);
  const missingQuotes = proportionWithCI(
    frames.filter((f) => f.market.lastPrice == null || f.dataQuality === "unavailable").length,
    frames.length
  );
  const outcomes = computeOutcomes(bySymbol, horizonMs);

  return {
    version: MONITOR_CALIBRATION_VERSION,
    sessionId: session.id,
    sampleFrames: frames.length,
    intensityByState,
    stateDuration: durations,
    transitions,
    falseOnePrintBreakouts: falseBreakouts,
    leaderChurn,
    staleData: stale,
    missingQuotes,
    outcomesAfterState: outcomes,
    disclaimer: DISCLAIMER,
  };
}

function groupBySymbol(frames: MonitorReplayFrame[]): Map<string, MonitorReplayFrame[]> {
  const m = new Map<string, MonitorReplayFrame[]>();
  for (const f of frames) {
    const arr = m.get(f.symbol) ?? [];
    arr.push(f);
    m.set(f.symbol, arr);
  }
  for (const arr of m.values()) arr.sort((a, b) => a.asOfMs - b.asOfMs);
  return m;
}

function computeIntensityByState(frames: MonitorReplayFrame[]): IntensityByState[] {
  const bucket = new Map<string, number[]>();
  for (const f of frames) {
    const st = f.momentum.state ?? "unknown";
    const iv = f.momentum.intensity;
    if (iv == null || !Number.isFinite(iv)) continue;
    const arr = bucket.get(st) ?? [];
    arr.push(iv);
    bucket.set(st, arr);
  }
  return [...bucket.entries()]
    .map(([state, vals]) => ({
      state,
      intensity: meanWithCI(vals),
      histogram: histogram(vals, INTENSITY_BINS),
    }))
    .sort((a, b) => a.state.localeCompare(b.state));
}

function computeStatePathMetrics(bySymbol: Map<string, MonitorReplayFrame[]>) {
  const durationBuckets = new Map<string, number[]>();
  const transitionCounts = new Map<string, number>();
  let breakoutCandidates = 0;
  let falseBreakouts = 0;

  for (const series of bySymbol.values()) {
    if (series.length < 2) continue;
    let runState = series[0]!.momentum.state ?? "unknown";
    let runStart = series[0]!.asOfMs;
    let priorIntensity = series[0]!.momentum.intensity;

    for (let i = 1; i < series.length; i++) {
      const f = series[i]!;
      const st = f.momentum.state ?? "unknown";
      if (st !== runState) {
        const dur = f.asOfMs - runStart;
        const arr = durationBuckets.get(runState) ?? [];
        arr.push(dur);
        durationBuckets.set(runState, arr);

        const key = `${runState}->${st}`;
        transitionCounts.set(key, (transitionCounts.get(key) ?? 0) + 1);

        // False one-print breakout: brief spike into hot state then immediate revert
        const wasHot =
          /break|surge|hot|expand/i.test(st) ||
          ((f.momentum.intensity ?? 0) > 0.75 && (priorIntensity ?? 0) < 0.5);
        if (wasHot) {
          breakoutCandidates += 1;
          const next = series[i + 1];
          if (
            next &&
            next.asOfMs - f.asOfMs <= 5_000 &&
            (next.momentum.state === runState ||
              (next.momentum.intensity ?? 0) < (f.momentum.intensity ?? 0) * 0.5)
          ) {
            falseBreakouts += 1;
          }
        }

        runState = st;
        runStart = f.asOfMs;
      }
      priorIntensity = f.momentum.intensity;
    }
    // close last run against session end of series
    const last = series[series.length - 1]!;
    const arr = durationBuckets.get(runState) ?? [];
    arr.push(Math.max(0, last.asOfMs - runStart));
    durationBuckets.set(runState, arr);
  }

  const durations: StateDurationRow[] = [...durationBuckets.entries()]
    .map(([state, vals]) => ({ state, durationMs: meanWithCI(vals) }))
    .sort((a, b) => a.state.localeCompare(b.state));

  const transitions: TransitionRow[] = [...transitionCounts.entries()]
    .map(([k, count]) => {
      const [from, to] = k.split("->");
      return { from: from!, to: to!, count };
    })
    .sort((a, b) => b.count - a.count);

  return {
    durations,
    transitions,
    falseBreakouts: proportionWithCI(falseBreakouts, breakoutCandidates),
  };
}

function computeLeaderChurn(frames: MonitorReplayFrame[]) {
  let leaderChanges = 0;
  for (const f of frames) {
    if (f.events.some((e) => e.kind === "leader_change")) leaderChanges += 1;
    else if (f.attention.previousRank != null && f.attention.rank === 1 && f.attention.previousRank !== 1) {
      leaderChanges += 1;
    }
  }
  const framesN = frames.length || 1;
  return {
    leaderChanges,
    frames: frames.length,
    churnPerThousandFrames: (leaderChanges / framesN) * 1000,
  };
}

function computeStale(session: MonitorReplaySession) {
  const frames = session.frames;
  const staleN = frames.filter((f) => f.dataQuality === "stale" || f.dataQuality === "degraded").length;
  // Approximate stale time: sum of gaps where latest visible had stale DQ
  let approxStaleMs = 0;
  const times = [...new Set(frames.map((f) => f.asOfMs))].sort((a, b) => a - b);
  for (let i = 0; i < times.length - 1; i++) {
    const t = times[i]!;
    const next = times[i + 1]!;
    const visible = framesAsOf(session, t);
    if (visible.some((f) => f.dataQuality === "stale" || f.dataQuality === "degraded")) {
      approxStaleMs += next - t;
    }
  }
  return {
    staleFrameShare: proportionWithCI(staleN, frames.length),
    approxStaleMs,
  };
}

function computeOutcomes(
  bySymbol: Map<string, MonitorReplayFrame[]>,
  horizonMs: number
): DescriptiveOutcome[] {
  const deltas = new Map<string, number[]>();
  for (const series of bySymbol.values()) {
    for (let i = 0; i < series.length; i++) {
      const f = series[i]!;
      const st = f.momentum.state;
      const iv0 = f.momentum.intensity;
      if (st == null || iv0 == null) continue;
      const target = f.asOfMs + horizonMs;
      // Look-ahead for descriptive outcome is intentional on historical archive,
      // but only uses frames that exist in the recorded session (already past).
      let later: MonitorReplayFrame | null = null;
      for (let j = i + 1; j < series.length; j++) {
        if (series[j]!.asOfMs >= target) {
          later = series[j]!;
          break;
        }
      }
      if (!later || later.momentum.intensity == null) continue;
      const arr = deltas.get(st) ?? [];
      arr.push(later.momentum.intensity - iv0);
      deltas.set(st, arr);
    }
  }
  return [...deltas.entries()]
    .map(([fromState, vals]) => ({
      fromState,
      intensityDelta: meanWithCI(vals),
      horizonMs,
      n: vals.length,
    }))
    .sort((a, b) => a.fromState.localeCompare(b.fromState));
}
