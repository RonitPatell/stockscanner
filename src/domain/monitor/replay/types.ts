/**
 * Compact, versioned Monitor Replay frames.
 * Enough to replay market-state / momentum / attention / events —
 * not a full tick archive.
 */

export type ReplayDataQuality = "ok" | "stale" | "degraded" | "unavailable";

export type ReplayEventKind =
  | "catalyst"
  | "risk"
  | "halt"
  | "data_quality"
  | "leader_change"
  | "rank_change"
  | "state_transition"
  | "momentum";

/** Sparse audit pointer — never a full raw tick dump. */
export interface ReplayRawRef {
  source: string;
  eventId: string;
  observedAtMs: number;
}

export interface ReplayEventRef {
  kind: ReplayEventKind;
  refId: string;
  summary: string;
  atMs: number;
}

export interface ReplayEngineVersions {
  marketState: string;
  momentum: string;
  momentumState: string;
  attention: string;
  /** Hash of tunables / config at capture time */
  configHash: string;
}

export interface MonitorReplayFrame {
  schemaVersion: string;
  asOfMs: number;
  symbol: string;
  versions: ReplayEngineVersions;
  market: {
    lastPrice: number | null;
    freshnessMs: number | null;
    tradesPerSecond: number | null;
    dollarVolumeVelocity: number | null;
    relativeVolume: number | null;
    spreadBps: number | null;
    sessionSegment: string | null;
  };
  momentum: {
    intensity: number | null;
    state: string | null;
    direction: string | null;
  };
  attention: {
    priority: number | null;
    rank: number | null;
    isLeader: boolean;
    previousRank: number | null;
  };
  events: ReplayEventRef[];
  dataQuality: ReplayDataQuality;
  corporateActionAdjusted: boolean;
  rawRefs: ReplayRawRef[];
}

export interface MonitorReplaySession {
  id: string;
  schemaVersion: string;
  createdAtMs: number;
  /** Inclusive time bounds of the recording */
  fromMs: number;
  toMs: number;
  symbolScope: string[];
  frames: MonitorReplayFrame[];
  /** Capture cadence metadata */
  meta: {
    maxFrames: number;
    minIntervalMs: number;
    note: string;
  };
}

export type ReplaySpeed = 1 | 2 | 5;

export interface ReplayPlayerState {
  sessionId: string;
  /** Wall-clock simulation cursor — only frames with asOfMs <= cursor are visible */
  cursorMs: number;
  speed: ReplaySpeed;
  index: number;
  playing: boolean;
  /** Frames emitted for the current cursor (no look-ahead) */
  visibleCount: number;
}

export interface CorporateActionFactor {
  symbol: string;
  effectiveAt: string;
  splitFactor: number;
  note?: string;
}

export interface ReplayStorePort {
  saveSession(session: MonitorReplaySession): Promise<void>;
  getSession(id: string): Promise<MonitorReplaySession | null>;
  listSessions(opts?: { limit?: number }): Promise<MonitorReplaySession[]>;
  appendFrames(sessionId: string, frames: MonitorReplayFrame[]): Promise<boolean>;
}
