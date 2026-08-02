import type { LadderFilter } from "./ladder/ladder-types.ts";
import type { SelectedTickerSeed } from "./selected-ticker/build-selected-ticker.ts";
import type { MonitorTapeItem } from "../../domain/monitor/event-tape/types.ts";

export type MonitorConnectionState =
  | "live"
  | "degraded"
  | "disconnected"
  | "delayed"
  | "partial_outage"
  | "loading"
  | "empty"
  | "error";

/** Status-bar / ladder filter presets (aligned with Priority Ladder). */
export type MonitorFilterPreset = LadderFilter;

export interface MonitorLadderRow {
  symbol: string;
  rank: number;
  attentionPriority: number;
  tier: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  momentumState: string;
  momentumIntensity: number;
  direction: "up" | "down" | "neutral";
  reason: string;
  onWatchlist: boolean;
  strategyMatch?: boolean;
  hasCatalyst?: boolean;
  catalystVerified?: boolean;
  halted?: boolean;
  criticalEvent?: boolean;
  dataConfidenceWarning?: boolean;
}

/** @deprecated Prefer MonitorTapeItem from domain/monitor/event-tape */
export type MonitorTapeEvent = MonitorTapeItem;

export interface MonitorViewModel {
  connection: MonitorConnectionState;
  lastEventAgeMs: number | null;
  sessionLabel: string;
  filterPreset: MonitorFilterPreset;
  ladder: MonitorLadderRow[];
  selectedSymbol: string | null;
  /** Per-symbol intelligence seeds for the selected-ticker panel. */
  intelSeeds: Record<string, SelectedTickerSeed>;
  tape: MonitorTapeItem[];
  providerNotes: string[];
}
