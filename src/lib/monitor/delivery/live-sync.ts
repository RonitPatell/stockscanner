/**
 * Client live-sync controller: SSR snapshot → catch-up → LIVE.
 * Pure enough for unit tests (inject EventSource / timers / now).
 */

import type {
  MonitorLadderSnapshot,
  MonitorStreamMessage,
} from "../../../domain/monitor/delivery/index.ts";
import {
  buildMonitorSyncAck,
  detectLiveGap,
  LONG_BACKGROUND_RESYNC_MS,
  reconnectDelayForVisibility,
  shouldApplyEntityVersion,
  syncShouldFreezeMotion,
  syncStatusLabel,
  syncToConnectionChrome,
  transitionSyncState,
  type MonitorSyncAck,
  type MonitorSyncDiagnostics,
  type MonitorSyncState,
  type SyncGapReason,
} from "../../../domain/monitor/sync/index.ts";
import { monitorPerfMark } from "../perf-marks.ts";
import { MonitorClientRuntime, MONITOR_SSE_LAST_ID_KEY } from "./client-runtime.ts";

export type LiveSyncEventSourceFactory = (url: string) => {
  onmessage: ((ev: MessageEvent) => void) | null;
  onerror: ((ev: Event) => void) | null;
  close: () => void;
};

export interface LiveSyncControllerOptions {
  initialSnapshot?: MonitorLadderSnapshot | null;
  initialLastEventId?: string | null;
  snapshotId?: string | null;
  streamPath?: string;
  frameBudgetMs?: number;
  nowMs?: () => number;
  eventSourceFactory?: LiveSyncEventSourceFactory;
  random?: () => number;
  onAck?: (ack: MonitorSyncAck) => void;
  ackIntervalMs?: number;
}

export class MonitorLiveSyncController {
  readonly runtime: MonitorClientRuntime;
  private syncState: MonitorSyncState = "DISCONNECTED";
  private snapshotId: string | null = null;
  private lastEventReceived: string | null = null;
  private lastEventApplied: string | null = null;
  private liveSyncCompleted = false;
  private streamConnected = false;
  private replayedUpdates = 0;
  private gapReason: SyncGapReason | null = null;
  private reconnectAttempt = 0;
  private documentHidden = false;
  private hiddenSinceMs: number | null = null;
  private es: ReturnType<LiveSyncEventSourceFactory> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private ackTimer: ReturnType<typeof setInterval> | null = null;
  private raf = 0;
  private closed = false;
  private catchupPendingFinal = false;
  private readonly opts: Required<
    Pick<
      LiveSyncControllerOptions,
      "streamPath" | "nowMs" | "random" | "ackIntervalMs"
    >
  > &
    LiveSyncControllerOptions;

  constructor(opts: LiveSyncControllerOptions = {}) {
    this.opts = {
      streamPath: "/api/monitor/stream",
      nowMs: () => Date.now(),
      random: Math.random,
      ackIntervalMs: 15_000,
      ...opts,
    };
    this.runtime = new MonitorClientRuntime({
      frameBudgetMs: opts.frameBudgetMs,
    });
    if (opts.initialSnapshot) {
      this.seedSnapshot(opts.initialSnapshot, opts.initialLastEventId ?? null);
    }
  }

  getSyncState(): MonitorSyncState {
    return this.syncState;
  }

  getDiagnostics(): MonitorSyncDiagnostics {
    return {
      syncState: this.syncState,
      replayedUpdates: this.replayedUpdates,
      lastEventReceived: this.lastEventReceived,
      lastEventApplied: this.lastEventApplied,
      snapshotId: this.snapshotId,
      gapReason: this.gapReason,
      reconnectAttempt: this.reconnectAttempt,
      documentHidden: this.documentHidden,
    };
  }

  statusLabel(): string {
    return syncStatusLabel(this.syncState);
  }

  connectionChrome() {
    return syncToConnectionChrome(this.syncState);
  }

  shouldFreezeMotion(): boolean {
    return syncShouldFreezeMotion(this.syncState);
  }

  seedSnapshot(
    snapshot: MonitorLadderSnapshot,
    lastEventId?: string | null
  ): void {
    const now = this.opts.nowMs();
    this.runtime.onVisibilityRestored(snapshot, now);
    this.snapshotId = String(snapshot.sequence);
    const seq =
      lastEventId && Number.isFinite(Number(lastEventId))
        ? Number(lastEventId)
        : snapshot.sequence;
    this.lastEventReceived = String(seq);
    this.lastEventApplied = String(seq);
    this.syncState = transitionSyncState(this.syncState, {
      type: "SNAPSHOT_LOADED",
    });
    if (this.syncState === "DISCONNECTED") {
      this.syncState = "SNAPSHOT_READY";
    }
  }

  start(): void {
    if (this.closed) return;
    this.clearReconnectTimer();
    if (this.syncState === "DISCONNECTED") {
      this.syncState = "SNAPSHOT_READY";
    }
    this.syncState = transitionSyncState(this.syncState, { type: "CONNECT" });
    if (
      this.syncState !== "CONNECTING" &&
      this.syncState !== "CATCHING_UP" &&
      this.syncState !== "LIVE"
    ) {
      this.syncState = "CONNECTING";
    }
    this.openEventSource();
    this.startApplyLoop();
    this.startAckLoop();
  }

  stop(): void {
    this.closed = true;
    this.es?.close();
    this.es = null;
    this.clearReconnectTimer();
    if (this.ackTimer) {
      clearInterval(this.ackTimer);
      this.ackTimer = null;
    }
    if (typeof cancelAnimationFrame === "function" && this.raf) {
      cancelAnimationFrame(this.raf);
    }
    this.syncState = "DISCONNECTED";
    this.streamConnected = false;
  }

  setDocumentHidden(hidden: boolean): void {
    const now = this.opts.nowMs();
    if (hidden) {
      this.documentHidden = true;
      this.hiddenSinceMs = now;
      return;
    }
    const hiddenFor =
      this.hiddenSinceMs != null ? now - this.hiddenSinceMs : 0;
    this.documentHidden = false;
    this.hiddenSinceMs = null;
    if (hiddenFor > LONG_BACKGROUND_RESYNC_MS) {
      // Long background → resync path on next messages; reconnect if needed.
      if (
        this.syncState === "DISCONNECTED" ||
        this.syncState === "RECONNECTING"
      ) {
        this.reconnectAttempt = 0;
        this.start();
      }
    }
  }

  /** Browser `online` event — immediate retry. */
  onBrowserOnline(): void {
    this.reconnectAttempt = 0;
    this.syncState = transitionSyncState(this.syncState, { type: "ONLINE" });
    this.start();
  }

  handleMessage(raw: MonitorStreamMessage & { type: string }): void {
    if ("sequence" in raw && typeof raw.sequence === "number") {
      this.lastEventReceived = String(raw.sequence);
    }

    switch (raw.type) {
      case "catchup_start": {
        this.syncState = transitionSyncState(this.syncState, {
          type: "CATCHUP_START",
        });
        this.catchupPendingFinal = true;
        this.gapReason =
          raw.reason === "none" ? null : (raw.reason as SyncGapReason);
        break;
      }
      case "catchup_complete": {
        this.replayedUpdates += raw.replayed ?? 0;
        if (raw.lastEventId) {
          this.lastEventReceived = String(raw.lastEventId);
        }
        // Wait until apply queue drains so LIVE means final catch-up applied.
        this.catchupPendingFinal = true;
        if (this.runtime.queue.stats().depth === 0) {
          this.catchupPendingFinal = false;
          this.liveSyncCompleted = true;
          if (raw.lastEventId) {
            this.lastEventApplied = String(raw.lastEventId);
          }
          this.syncState = "LIVE";
          this.emitAck();
        }
        break;
      }
      case "resync_required": {
        this.gapReason = raw.reason as SyncGapReason;
        this.runtime.accept({
          type: "snapshot",
          id: raw.id,
          sequence: raw.sequence,
          payload: raw.payload,
        });
        this.snapshotId = String(raw.payload.sequence);
        this.replayedUpdates += 1;
        break;
      }
      case "connected": {
        this.streamConnected = true;
        this.reconnectAttempt = 0;
        monitorPerfMark("monitor_stream_connected");
        break;
      }
      case "snapshot":
      case "delta":
      case "health":
      case "heartbeat":
      case "ack_request":
      case "entitlement_revoked": {
        if (raw.type === "delta") {
          const last = this.runtime.getState().lastSequence;
          if ("sequence" in raw) {
            const gap = detectLiveGap(last, raw.sequence);
            if (gap.gap && this.syncState === "LIVE") {
              this.gapReason = gap.reason;
              // Server should resync; mark degraded until catch-up.
              this.syncState = transitionSyncState(this.syncState, {
                type: "DEGRADE",
              });
            }
          }
          // Entity-version filter before enqueue
          const filtered = raw.payload.filter((d) => {
            const prev = this.runtime.getState().symbols.get(d.symbol);
            return shouldApplyEntityVersion(prev?.sequence, d.sequence);
          });
          if (!filtered.length) return;
          this.runtime.accept({ ...raw, payload: filtered });
        } else if ("sequence" in raw || raw.type === "entitlement_revoked") {
          this.runtime.accept(raw as MonitorStreamMessage);
        }
        break;
      }
      default:
        break;
    }
  }

  /** Apply queued frames; transition to LIVE after final catch-up apply. */
  applyFrame(documentVisible: boolean): void {
    const before = this.runtime.getState().lastSequence;
    const { applied, state } = this.runtime.applyFrame({
      nowMs: this.opts.nowMs(),
      documentVisible,
    });
    if (applied > 0 && state.lastSequence > before) {
      this.lastEventApplied = String(state.lastSequence);
    }
    if (
      this.catchupPendingFinal &&
      this.runtime.queue.stats().depth === 0 &&
      (applied > 0 || this.lastEventApplied != null)
    ) {
      this.catchupPendingFinal = false;
      this.liveSyncCompleted = true;
      this.syncState = transitionSyncState(this.syncState, {
        type: "CATCHUP_APPLIED",
      });
      if (this.syncState !== "LIVE") {
        this.syncState = "LIVE";
      }
      this.emitAck();
    }
    if (state.health === "degraded" || state.health === "stale") {
      if (this.syncState === "LIVE") {
        this.syncState = transitionSyncState(this.syncState, { type: "DEGRADE" });
      }
    }
  }

  buildAck(): MonitorSyncAck {
    return buildMonitorSyncAck({
      streamConnected: this.streamConnected,
      snapshotId: this.snapshotId,
      lastEventReceived: this.lastEventReceived,
      lastEventApplied: this.lastEventApplied,
      liveSyncCompleted: this.liveSyncCompleted,
      sequence: this.runtime.getState().lastSequence,
    });
  }

  private openEventSource(): void {
    this.es?.close();
    const last =
      this.lastEventApplied ||
      this.runtime.lastEventId() ||
      (typeof sessionStorage !== "undefined"
        ? sessionStorage.getItem(MONITOR_SSE_LAST_ID_KEY)
        : null);
    const qs = new URLSearchParams();
    if (last) qs.set("lastEventId", last);
    const url = `${this.opts.streamPath}?${qs.toString()}`;
    const factory =
      this.opts.eventSourceFactory ??
      ((u: string) => new EventSource(u) as ReturnType<LiveSyncEventSourceFactory>);
    const es = factory(url);
    this.es = es;
    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as MonitorStreamMessage & {
          type: string;
        };
        if (event.lastEventId && typeof sessionStorage !== "undefined") {
          sessionStorage.setItem(MONITOR_SSE_LAST_ID_KEY, event.lastEventId);
        } else if ("sequence" in msg && msg.sequence) {
          if (typeof sessionStorage !== "undefined") {
            sessionStorage.setItem(
              MONITOR_SSE_LAST_ID_KEY,
              String(msg.sequence)
            );
          }
        }
        this.handleMessage(msg);
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => {
      this.streamConnected = false;
      this.syncState = transitionSyncState(this.syncState, {
        type: "DISCONNECT",
      });
      if (this.syncState !== "RECONNECTING") {
        this.syncState = "RECONNECTING";
      }
      es.close();
      this.es = null;
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    this.clearReconnectTimer();
    const delay = reconnectDelayForVisibility(
      this.reconnectAttempt,
      this.documentHidden,
      undefined,
      this.opts.random
    );
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      if (this.closed) return;
      // Avoid storms while hidden — still eventually retry.
      this.syncState = "CONNECTING";
      this.openEventSource();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private startApplyLoop(): void {
    if (typeof requestAnimationFrame !== "function") return;
    const loop = () => {
      if (this.closed) return;
      this.applyFrame(!this.documentHidden);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private startAckLoop(): void {
    if (this.ackTimer) clearInterval(this.ackTimer);
    this.ackTimer = setInterval(() => this.emitAck(), this.opts.ackIntervalMs);
    // Allow Node test runners to exit when no other work remains.
    this.ackTimer.unref?.();
  }

  private emitAck(): void {
    const ack = this.buildAck();
    if (ack.sequence < 1 && !ack.streamConnected) return;
    this.opts.onAck?.(ack);
  }
}

