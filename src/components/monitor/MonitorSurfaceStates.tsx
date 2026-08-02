"use client";

/**
 * Legacy entry — prefer `./states` imports.
 * Kept so existing imports and file-presence tests stay stable.
 */
export {
  MonitorLoadingSkeleton,
  MonitorQuietState,
  MonitorNoMatchState,
  MonitorDisconnectOverlay,
  MonitorOutageBanner,
  MonitorErrorState,
  createMonitorDiagnosticId,
  sanitizeProviderNotes,
} from "./states/index.ts";

import type { MonitorConnectionState } from "./monitor-types.ts";
import { MonitorLoadingSkeleton } from "./states/MonitorLoadingSkeleton.tsx";
import { MonitorQuietState } from "./states/MonitorQuietState.tsx";
import { MonitorErrorState } from "./states/MonitorErrorState.tsx";
import { createMonitorDiagnosticId } from "./states/monitor-state-copy.ts";

/**
 * Full-panel surface for loading / quiet / error when spatial UI is hidden.
 * Disconnected uses an overlay on last-known spatial UI instead.
 */
export function MonitorSurfaceState({
  connection,
  notes,
  diagnosticId,
  onRetry,
  onShowAll,
  onChangePreset,
  onOpenWatchlist,
}: {
  connection: MonitorConnectionState;
  notes?: string[];
  diagnosticId?: string;
  onRetry?: () => void;
  onShowAll?: () => void;
  onChangePreset?: () => void;
  onOpenWatchlist?: () => void;
}) {
  if (connection === "loading") {
    return <MonitorLoadingSkeleton />;
  }
  if (connection === "empty") {
    return (
      <MonitorQuietState
        notes={notes}
        onShowAll={onShowAll}
        onChangePreset={onChangePreset}
        onOpenWatchlist={onOpenWatchlist}
      />
    );
  }
  if (connection === "error") {
    return (
      <MonitorErrorState
        diagnosticId={diagnosticId ?? createMonitorDiagnosticId()}
        onRetry={onRetry}
      />
    );
  }
  return null;
}

export function connectionTone(
  c: MonitorConnectionState
): "live" | "warn" | "danger" | "info" {
  if (c === "live") return "live";
  if (c === "degraded" || c === "delayed" || c === "partial_outage") return "warn";
  if (c === "disconnected" || c === "error") return "danger";
  return "info";
}

export function connectionLabel(c: MonitorConnectionState): string {
  switch (c) {
    case "live":
      return "Live";
    case "degraded":
      return "Degraded";
    case "disconnected":
      return "Disconnected";
    case "delayed":
      return "Delayed data";
    case "partial_outage":
      return "Partial outage";
    case "loading":
      return "Syncing live…";
    case "empty":
      return "Empty";
    case "error":
      return "Error";
    default:
      return c;
  }
}
