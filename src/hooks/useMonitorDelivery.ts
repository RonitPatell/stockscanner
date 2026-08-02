"use client";

import { useEffect, useRef, useState } from "react";
import type {
  MonitorLadderRow,
  MonitorConnectionState,
} from "@/components/monitor/monitor-types";
import type { MonitorLadderSnapshot } from "@/domain/monitor/delivery";
import type { MonitorSyncDiagnostics, MonitorSyncState } from "@/domain/monitor/sync";
import { isMonitorLiveDeliveryEnabled } from "@/lib/monitor/flags";
import { monitorPerfMark } from "@/lib/monitor/perf-marks";
import { MonitorLiveSyncController } from "@/lib/monitor/delivery/live-sync";
import { connectionFromHealth } from "@/lib/monitor/delivery/client-runtime";

function tierFromPriority(p: number | null): MonitorLadderRow["tier"] {
  if (p == null) return "LOW";
  if (p >= 80) return "CRITICAL";
  if (p >= 60) return "HIGH";
  if (p >= 35) return "MEDIUM";
  return "LOW";
}

function rowsFromController(ctrl: MonitorLiveSyncController): MonitorLadderRow[] {
  const symbols = [...ctrl.runtime.getState().symbols.values()].sort(
    (a, b) => (a.rank ?? 999) - (b.rank ?? 999)
  );
  return symbols.map((d) => ({
    symbol: d.symbol,
    rank: d.rank ?? 999,
    attentionPriority: d.attentionPriority ?? 0,
    tier: tierFromPriority(d.attentionPriority),
    momentumState: d.stale
      ? `${d.momentumState ?? "UNKNOWN"} · STALE`
      : d.momentumState ?? "UNKNOWN",
    momentumIntensity: d.momentumIntensity ?? 0,
    direction: d.direction ?? "neutral",
    reason: d.stale
      ? "Stale — not live"
      : d.criticalEvent
        ? "Critical event"
        : d.halted
          ? "Halt"
          : "Server snapshot",
    onWatchlist: false,
    halted: d.halted,
    criticalEvent: d.criticalEvent,
    dataConfidenceWarning:
      d.stale ||
      d.dataAvailability === "stale" ||
      d.dataAvailability === "degraded" ||
      d.dataAvailability === "unavailable",
    hasCatalyst: d.criticalEvent,
  }));
}

export interface UseMonitorDeliveryResult {
  enabled: boolean;
  connection: MonitorConnectionState;
  syncState: MonitorSyncState;
  statusLabel: string;
  ladder: MonitorLadderRow[];
  lastEventAgeMs: number | null;
  notes: string[];
  lastSequence: number;
  clientReady: boolean;
  freezeMotion: boolean;
  diagnostics: MonitorSyncDiagnostics | null;
}

/**
 * Gapless Monitor delivery: SSR snapshot → SSE catch-up → LIVE.
 * Never clears a populated ladder while connecting / catching up.
 */
export function useMonitorDelivery(opts?: {
  enabled?: boolean;
  frameBudgetMs?: number;
  initialLadderSnapshot?: MonitorLadderSnapshot | null;
  initialLadderRows?: MonitorLadderRow[];
  initialLastEventAgeMs?: number | null;
  initialLastEventId?: string | null;
  snapshotId?: string | null;
}): UseMonitorDeliveryResult {
  const enabled =
    opts?.enabled ??
    (typeof window !== "undefined" ? isMonitorLiveDeliveryEnabled() : false);

  const seeded = Boolean(opts?.initialLadderSnapshot);
  const ctrlRef = useRef<MonitorLiveSyncController | null>(null);
  if (!ctrlRef.current) {
    ctrlRef.current = new MonitorLiveSyncController({
      initialSnapshot: opts?.initialLadderSnapshot ?? null,
      initialLastEventId: opts?.initialLastEventId ?? null,
      snapshotId: opts?.snapshotId ?? null,
      frameBudgetMs: opts?.frameBudgetMs,
      onAck: (ack) => {
        void fetch("/api/monitor/ack", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ack),
        }).catch(() => {});
      },
    });
  }

  const [connection, setConnection] = useState<MonitorConnectionState>(() =>
    seeded ? "loading" : "loading"
  );
  const [syncState, setSyncState] = useState<MonitorSyncState>(() =>
    seeded ? "SNAPSHOT_READY" : "DISCONNECTED"
  );
  const [statusLabel, setStatusLabel] = useState(() =>
    seeded ? "Syncing live…" : "Connecting"
  );
  const [ladder, setLadder] = useState<MonitorLadderRow[]>(
    () => opts?.initialLadderRows ?? []
  );
  const [lastEventAgeMs, setAge] = useState<number | null>(
    () => opts?.initialLastEventAgeMs ?? null
  );
  const [notes, setNotes] = useState<string[]>([]);
  const [lastSequence, setSeq] = useState(0);
  const [clientReady, setClientReady] = useState(false);
  const [freezeMotion, setFreezeMotion] = useState(true);
  const [diagnostics, setDiagnostics] = useState<MonitorSyncDiagnostics | null>(
    null
  );

  useEffect(() => {
    setClientReady(true);
  }, []);

  useEffect(() => {
    if (!enabled || !clientReady) return;
    const ctrl = ctrlRef.current!;
    if (opts?.initialLadderSnapshot && ctrl.getSyncState() === "DISCONNECTED") {
      ctrl.seedSnapshot(
        opts.initialLadderSnapshot,
        opts.initialLastEventId ?? null
      );
    }
    ctrl.start();
    if (seeded) {
      monitorPerfMark("monitor_snapshot_rendered", { detail: "ssr_seed" });
    }

    const tick = () => {
      const rows = rowsFromController(ctrl);
      if (rows.length > 0) setLadder(rows);
      const st = ctrl.getSyncState();
      setSyncState(st);
      setStatusLabel(ctrl.statusLabel());
      setFreezeMotion(ctrl.shouldFreezeMotion());
      setDiagnostics(ctrl.getDiagnostics());
      const chrome = ctrl.connectionChrome();
      // Keep snapshot-looking chrome as loading/syncing, not blank disconnected,
      // while reconnecting with data still on screen.
      if (chrome === "loading") setConnection("loading");
      else if (chrome === "live") setConnection("live");
      else if (chrome === "degraded") setConnection("degraded");
      else if (chrome === "delayed") setConnection("delayed");
      else setConnection("disconnected");

      const rt = ctrl.runtime.getState();
      setNotes(rt.notes);
      setSeq(rt.lastSequence);
      setAge(
        rt.lastEventAtMs != null ? Date.now() - rt.lastEventAtMs : null
      );
      // Prefer health mapping when live
      if (st === "LIVE" || st === "DEGRADED") {
        setConnection(connectionFromHealth(rt.health));
      }
    };

    const id = setInterval(tick, 100);
    tick();

    const onVis = () => {
      ctrl.setDocumentHidden(document.visibilityState === "hidden");
    };
    const onOnline = () => ctrl.onBrowserOnline();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", onOnline);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", onOnline);
      ctrl.stop();
    };
  }, [
    enabled,
    clientReady,
    seeded,
    opts?.initialLadderSnapshot,
    opts?.initialLastEventId,
  ]);

  if (!enabled) {
    return {
      enabled: false,
      connection: "live",
      syncState: "SNAPSHOT_READY",
      statusLabel: "Snapshot ready",
      ladder: opts?.initialLadderRows ?? [],
      lastEventAgeMs: opts?.initialLastEventAgeMs ?? null,
      notes: [],
      lastSequence: 0,
      clientReady,
      freezeMotion: false,
      diagnostics: null,
    };
  }

  return {
    enabled: true,
    connection,
    syncState,
    statusLabel,
    ladder,
    lastEventAgeMs,
    notes,
    lastSequence,
    clientReady,
    freezeMotion,
    diagnostics,
  };
}
