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
}

const WIRE_CYCLE_MS = 3_000;
const WIRE_STALE_MS = 60_000;
const PIPELINE_STALE_MS = 6 * 60_000;

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
    };
  }
  return globalHealth.__trustHealth;
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
  s.wireInFlight = false;
  s.lastWireFinishedAt = new Date().toISOString();
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
    wireCycleMs: WIRE_CYCLE_MS,
    avgIngestDelaySec: s.avgIngestDelaySec,
    feedUpdatedAt: s.feedUpdatedAt,
    feedItemCount: s.feedItemCount,
    feedSource: s.feedSource,
  };
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
