/**
 * Server → client Monitor bootstrap envelope.
 * Next.js 16.2: request-time dynamic (auth). Do not put personalized
 * payloads behind `"use cache"` / unstable_cache.
 */

import type {
  MonitorPublicSnapshot,
  MonitorSnapshotTicker,
} from "../../../domain/monitor/snapshot/index.ts";

export type MonitorSnapshotSourceType =
  | "REDIS_FRESH"
  | "REDIS_STALE"
  | "POSTGRES_FALLBACK"
  | "UNAVAILABLE";

export type MonitorDisplayDensity = "compact" | "comfortable" | "dense";

/** Lightweight prefs only — never full strategy JSON. */
export interface MonitorUiPreferences {
  activePresetId: string | null;
  pinnedTicker: string | null;
  displayDensity: MonitorDisplayDensity;
  squawkEnabled: boolean;
}

export interface MonitorInitialSnapshot {
  ok: boolean;
  source: MonitorSnapshotSourceType;
  generatedAt: string;
  generatedAtMs: number;
  dataAgeMs: number | null;
  lastEventId: string | null;
  /** Personalized public snapshot (or null when unavailable). */
  snapshot: MonitorPublicSnapshot | null;
  prefs: MonitorUiPreferences;
  /** Selected ticker for intel summary on first paint. */
  selectedSymbol: string | null;
  selectedSummary: MonitorSnapshotTicker | null;
  error?: { code: string; message: string } | null;
}

export const MONITOR_REDIS_READ_TIMEOUT_MS = 400;
/** Younger than this → REDIS_FRESH; otherwise REDIS_STALE if still valid. */
export const MONITOR_SNAPSHOT_FRESH_MAX_AGE_MS = 15_000;

export const DEFAULT_MONITOR_UI_PREFS: MonitorUiPreferences = {
  activePresetId: null,
  pinnedTicker: null,
  displayDensity: "comfortable",
  squawkEnabled: true,
};
