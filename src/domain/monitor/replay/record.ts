/**
 * Compact frame builders — periodic snapshots, not every tick.
 */

import { MONITOR_REPLAY_VERSION } from "./version.ts";
import type {
  MonitorReplayFrame,
  MonitorReplaySession,
  ReplayDataQuality,
  ReplayEngineVersions,
  ReplayEventRef,
  ReplayRawRef,
} from "./types.ts";

export interface CaptureInput {
  asOfMs: number;
  symbol: string;
  versions: ReplayEngineVersions;
  market: MonitorReplayFrame["market"];
  momentum: MonitorReplayFrame["momentum"];
  attention: MonitorReplayFrame["attention"];
  events?: ReplayEventRef[];
  dataQuality: ReplayDataQuality;
  corporateActionAdjusted?: boolean;
  rawRefs?: ReplayRawRef[];
}

export function buildReplayFrame(input: CaptureInput): MonitorReplayFrame {
  return {
    schemaVersion: MONITOR_REPLAY_VERSION,
    asOfMs: input.asOfMs,
    symbol: input.symbol.toUpperCase(),
    versions: input.versions,
    market: { ...input.market },
    momentum: { ...input.momentum },
    attention: { ...input.attention },
    events: input.events ? [...input.events] : [],
    dataQuality: input.dataQuality,
    corporateActionAdjusted: Boolean(input.corporateActionAdjusted),
    rawRefs: input.rawRefs ? [...input.rawRefs] : [],
  };
}

export interface SessionCreateOpts {
  id: string;
  createdAtMs?: number;
  fromMs: number;
  toMs: number;
  symbolScope: string[];
  frames?: MonitorReplayFrame[];
  maxFrames?: number;
  minIntervalMs?: number;
}

export function createReplaySession(opts: SessionCreateOpts): MonitorReplaySession {
  const frames = sortFrames(opts.frames ?? []);
  return {
    id: opts.id,
    schemaVersion: MONITOR_REPLAY_VERSION,
    createdAtMs: opts.createdAtMs ?? Date.now(),
    fromMs: opts.fromMs,
    toMs: opts.toMs,
    symbolScope: opts.symbolScope.map((s) => s.toUpperCase()),
    frames,
    meta: {
      maxFrames: opts.maxFrames ?? 5000,
      minIntervalMs: opts.minIntervalMs ?? 1000,
      note: "Compact frames only — not a full tick archive. rawRefs audit calculations.",
    },
  };
}

/** Enforce monotonic asOfMs and drop look-ahead / out-of-order frames. */
export function sortFrames(frames: MonitorReplayFrame[]): MonitorReplayFrame[] {
  return [...frames].sort((a, b) => a.asOfMs - b.asOfMs || a.symbol.localeCompare(b.symbol));
}

/**
 * Append frames respecting min interval per symbol and maxFrames.
 * Rejects frames with asOfMs beyond session.toMs or before fromMs.
 */
export function appendCompactFrames(
  session: MonitorReplaySession,
  incoming: MonitorReplayFrame[]
): MonitorReplaySession {
  const bySymbolLast = new Map<string, number>();
  for (const f of session.frames) {
    bySymbolLast.set(f.symbol, Math.max(bySymbolLast.get(f.symbol) ?? 0, f.asOfMs));
  }

  const accepted: MonitorReplayFrame[] = [];
  for (const raw of sortFrames(incoming)) {
    if (raw.asOfMs < session.fromMs || raw.asOfMs > session.toMs) continue;
    const last = bySymbolLast.get(raw.symbol) ?? -Infinity;
    if (raw.asOfMs - last < session.meta.minIntervalMs && last !== -Infinity) {
      // Densify only for notable events — rawRefs alone (audit pointers) do not count
      if (!raw.events.length) continue;
    }
    accepted.push(raw);
    bySymbolLast.set(raw.symbol, raw.asOfMs);
  }

  let frames = sortFrames([...session.frames, ...accepted]);
  if (frames.length > session.meta.maxFrames) {
    frames = frames.slice(frames.length - session.meta.maxFrames);
  }
  return { ...session, frames };
}

/** Frames available at cursor — strict as-of, no future data. */
export function framesAsOf(
  session: MonitorReplaySession,
  cursorMs: number,
  symbol?: string
): MonitorReplayFrame[] {
  const sym = symbol?.toUpperCase();
  return session.frames.filter(
    (f) => f.asOfMs <= cursorMs && (sym == null || f.symbol === sym)
  );
}

/** Latest frame per symbol at cursor. */
export function latestBySymbolAsOf(
  session: MonitorReplaySession,
  cursorMs: number
): Map<string, MonitorReplayFrame> {
  const map = new Map<string, MonitorReplayFrame>();
  for (const f of framesAsOf(session, cursorMs)) {
    const prev = map.get(f.symbol);
    if (!prev || f.asOfMs >= prev.asOfMs) map.set(f.symbol, f);
  }
  return map;
}
