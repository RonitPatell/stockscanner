import { assignCluster, createClusterState, type ClusterState } from "./cluster.ts";
import {
  createDedupeState,
  decideDedupe,
  pruneDedupeState,
  rememberAccepted,
  type DedupeState,
} from "./dedupe.ts";
import { EVENT_TAPE_CONFIG } from "./config.ts";
import { MemoryEventTapeStore } from "./memory-store.ts";
import { normalizeTapeSignal } from "./normalize.ts";
import type {
  EventTapeStorePort,
  MonitorTapeItem,
  RawTapeSignal,
  TapeIngestResult,
} from "./types.ts";

export interface EventTapeEngineOptions {
  store?: EventTapeStorePort;
  cooldownMs?: number;
  hysteresisMs?: number;
  clusterWindowMs?: number;
}

/**
 * Normalize → dedupe/cooldown/hysteresis → cluster → retain.
 * Pure orchestration over an EventTapeStorePort.
 */
export class EventTapeEngine {
  readonly store: EventTapeStorePort;
  private readonly dedupe: DedupeState;
  private readonly clusters: ClusterState;
  private readonly cooldownMs: number;
  private readonly hysteresisMs: number;
  private readonly clusterWindowMs: number;

  constructor(opts?: EventTapeEngineOptions) {
    this.store = opts?.store ?? new MemoryEventTapeStore();
    this.dedupe = createDedupeState();
    this.clusters = createClusterState();
    this.cooldownMs = opts?.cooldownMs ?? EVENT_TAPE_CONFIG.cooldownMs;
    this.hysteresisMs = opts?.hysteresisMs ?? EVENT_TAPE_CONFIG.hysteresisMs;
    this.clusterWindowMs =
      opts?.clusterWindowMs ?? EVENT_TAPE_CONFIG.clusterWindowMs;
  }

  async ingest(signals: RawTapeSignal[]): Promise<TapeIngestResult> {
    const accepted: MonitorTapeItem[] = [];
    const dropped: TapeIngestResult["dropped"] = [];
    const clustersUpdated = new Set<string>();

    // Process in time order so cooldown/hysteresis see prior accepts.
    const ordered = [...signals].sort((a, b) => a.atMs - b.atMs);

    for (const signal of ordered) {
      const item = normalizeTapeSignal(signal);
      if (!item) {
        dropped.push({ signal, reason: "invalid" });
        continue;
      }

      const decision = decideDedupe(item, this.dedupe, {
        cooldownMs: this.cooldownMs,
        hysteresisMs: this.hysteresisMs,
        nowMs: item.atMs,
      });
      if (!decision.ok) {
        dropped.push({ signal, reason: decision.reason });
        continue;
      }

      const clusterId = assignCluster(item, this.clusters, {
        windowMs: this.clusterWindowMs,
      });
      if (clusterId) clustersUpdated.add(clusterId);

      rememberAccepted(item, this.dedupe);
      accepted.push(item);
    }

    if (accepted.length) {
      await this.store.append(accepted);
    }

    const newest = ordered[ordered.length - 1]?.atMs ?? Date.now();
    pruneDedupeState(this.dedupe, newest);

    return {
      accepted,
      dropped,
      clustersUpdated: [...clustersUpdated],
    };
  }

  async list(opts?: {
    sinceMs?: number;
    limit?: number;
    symbol?: string;
  }): Promise<MonitorTapeItem[]> {
    return this.store.list(opts);
  }
}
