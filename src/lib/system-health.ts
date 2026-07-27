/** Shared ingest / feed health metrics for trust dashboard and /api/health */

export interface SystemHealthSnapshot {
  pipelineInFlight: boolean;
  wireInFlight: boolean;
  lastFinishedAt: string | null;
  lastWireFinishedAt: string | null;
  lastStartedAt: string | null;
  lastWireStartedAt: string | null;
  lastResult: Record<string, unknown> | null;
  lastWireResult: Record<string, unknown> | null;
  scaleMode: boolean;
  wireCycleMs: number;
  avgIngestDelaySec: number | null;
  feedUpdatedAt: string | null;
  feedItemCount: number;
  feedSource: "redis" | "memory" | "none";
  /** Browser EventSource handshake counters (reliability). */
  browserStreamSuccesses: number;
  browserStreamFailures: number;
}

export type FeedHealthStatus = "live" | "ingesting" | "stale" | "starting";

/** Fallback when we have not observed enough wire finishes yet. */
export const WIRE_CYCLE_MS_FALLBACK = 60_000;
/** @deprecated Prefer measuredWireCycleMs — kept for older imports. */
export const WIRE_CYCLE_MS = WIRE_CYCLE_MS_FALLBACK;
export const FEED_STALE_MS = 3 * 60_000;
const WIRE_STALE_MS = 90_000;
const PIPELINE_STALE_MS = 6 * 60_000;
const MAX_WIRE_INTERVAL_SAMPLES = 12;

export function classifyFeedHealth({
  feedUpdatedAt,
  feedItemCount,
  pipelineInFlight,
  nowMs = Date.now(),
}: {
  feedUpdatedAt: string | null;
  feedItemCount: number;
  pipelineInFlight: boolean;
  nowMs?: number;
}): { status: FeedHealthStatus; feedAgeSec: number | null } {
  if (!feedUpdatedAt) {
    return {
      status: pipelineInFlight ? "ingesting" : feedItemCount > 0 ? "stale" : "starting",
      feedAgeSec: null,
    };
  }

  const updatedMs = new Date(feedUpdatedAt).getTime();
  if (!Number.isFinite(updatedMs)) {
    return {
      status: pipelineInFlight ? "ingesting" : feedItemCount > 0 ? "stale" : "starting",
      feedAgeSec: null,
    };
  }

  const ageMs = Math.max(0, nowMs - updatedMs);
  return {
    status: pipelineInFlight ? "ingesting" : ageMs <= FEED_STALE_MS ? "live" : "stale",
    feedAgeSec: Math.floor(ageMs / 1000),
  };
}

const globalHealth = globalThis as typeof globalThis & {
  __trustHealth?: {
    pipelineInFlight: boolean;
    wireInFlight: boolean;
    lastFinishedAt: string | null;
    lastWireFinishedAt: string | null;
    lastStartedAt: string | null;
    lastWireStartedAt: string | null;
    lastResult: Record<string, unknown> | null;
    lastWireResult: Record<string, unknown> | null;
    avgIngestDelaySec: number | null;
    feedUpdatedAt: string | null;
    feedItemCount: number;
    feedSource: "redis" | "memory" | "none";
    /** Observed gaps between successful wire finishes (ms). */
    wireIntervalsMs: number[];
    browserStreamSuccesses: number;
    browserStreamFailures: number;
  };
};

function store() {
  if (!globalHealth.__trustHealth) {
    globalHealth.__trustHealth = {
      pipelineInFlight: false,
      wireInFlight: false,
      lastFinishedAt: null,
      lastWireFinishedAt: null,
      lastStartedAt: null,
      lastWireStartedAt: null,
      lastResult: null,
      lastWireResult: null,
      avgIngestDelaySec: null,
      feedUpdatedAt: null,
      feedItemCount: 0,
      feedSource: "none",
      wireIntervalsMs: [],
      browserStreamSuccesses: 0,
      browserStreamFailures: 0,
    };
  }
  const s = globalHealth.__trustHealth;
  if (s.browserStreamSuccesses == null) s.browserStreamSuccesses = 0;
  if (s.browserStreamFailures == null) s.browserStreamFailures = 0;
  return s;
}

/** Median of observed wire finish intervals, else fallback (Vercel cron ≈ 60s). */
export function measuredWireCycleMs(): number {
  const samples = store().wireIntervalsMs;
  if (samples.length < 2) return WIRE_CYCLE_MS_FALLBACK;
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

export function markPipelineStarted(): void {
  const s = store();
  s.pipelineInFlight = true;
  s.lastStartedAt = new Date().toISOString();
}

export function markPipelineFinished(result: Record<string, unknown>): void {
  const s = store();
  s.pipelineInFlight = false;
  s.lastFinishedAt = new Date().toISOString();
  s.lastResult = result;
}

export function markPipelineFailed(error: string): void {
  const s = store();
  s.pipelineInFlight = false;
  s.lastFinishedAt = new Date().toISOString();
  s.lastResult = { ok: false, error };
}

export function setAvgIngestDelaySec(sec: number | null): void {
  store().avgIngestDelaySec = sec;
}

export function setFeedMeta(
  updatedAt: string | null,
  count: number,
  source: "redis" | "memory" | "none"
): void {
  const s = store();
  s.feedUpdatedAt = updatedAt;
  s.feedItemCount = count;
  s.feedSource = source;
}

export function markWireStarted(): void {
  const s = store();
  s.wireInFlight = true;
  s.lastWireStartedAt = new Date().toISOString();
}

export function markWireFinished(result: Record<string, unknown>): void {
  const s = store();
  const now = Date.now();
  if (s.lastWireFinishedAt) {
    const prev = new Date(s.lastWireFinishedAt).getTime();
    if (Number.isFinite(prev) && now > prev) {
      const gap = now - prev;
      // Ignore absurd gaps (deploy downtime) so the median stays honest
      if (gap >= 1_500 && gap <= 5 * 60_000) {
        s.wireIntervalsMs = [...s.wireIntervalsMs, gap].slice(-MAX_WIRE_INTERVAL_SAMPLES);
      }
    }
  }
  s.wireInFlight = false;
  s.lastWireFinishedAt = new Date(now).toISOString();
  s.lastWireResult = result;
}

export function markWireFailed(error: string): void {
  const s = store();
  s.wireInFlight = false;
  s.lastWireFinishedAt = new Date().toISOString();
  s.lastWireResult = { ok: false, error };
}

export function getSystemHealth(scaleMode: boolean): SystemHealthSnapshot {
  const s = store();
  return {
    pipelineInFlight: s.pipelineInFlight,
    wireInFlight: s.wireInFlight,
    lastFinishedAt: s.lastFinishedAt,
    lastWireFinishedAt: s.lastWireFinishedAt,
    lastStartedAt: s.lastStartedAt,
    lastWireStartedAt: s.lastWireStartedAt,
    lastResult: s.lastResult,
    lastWireResult: s.lastWireResult,
    scaleMode,
    wireCycleMs: measuredWireCycleMs(),
    avgIngestDelaySec: s.avgIngestDelaySec,
    feedUpdatedAt: s.feedUpdatedAt,
    feedItemCount: s.feedItemCount,
    feedSource: s.feedSource,
    browserStreamSuccesses: s.browserStreamSuccesses,
    browserStreamFailures: s.browserStreamFailures,
  };
}

/** Record browser EventSource open/fail for reliability indicators. */
export function recordBrowserStreamHandshake(ok: boolean): void {
  const s = store();
  if (ok) s.browserStreamSuccesses += 1;
  else s.browserStreamFailures += 1;
}

export function isPipelineInFlight(): boolean {
  const s = store();
  if (!s.pipelineInFlight) return false;
  if (!s.lastStartedAt) return true;
  const elapsed = Date.now() - new Date(s.lastStartedAt).getTime();
  if (elapsed >= PIPELINE_STALE_MS) {
    s.pipelineInFlight = false;
    return false;
  }
  return true;
}

export function isWireInFlight(): boolean {
  const s = store();
  if (!s.wireInFlight) return false;
  if (!s.lastWireStartedAt) return true;
  const elapsed = Date.now() - new Date(s.lastWireStartedAt).getTime();
  if (elapsed >= WIRE_STALE_MS) {
    s.wireInFlight = false;
    return false;
  }
  return true;
}
