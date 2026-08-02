import { TAPE_EVENT_CATALOG, composeExplanation } from "./catalog.ts";
import { DEFAULT_SEVERITY } from "./config.ts";
import { MONITOR_EVENT_TAPE_VERSION } from "./version.ts";
import {
  MONITOR_TAPE_EVENT_TYPES,
  type MonitorTapeEventType,
  type MonitorTapeItem,
  type RawTapeSignal,
} from "./types.ts";

const TYPE_SET = new Set<string>(MONITOR_TAPE_EVENT_TYPES);

export function isMonitorTapeEventType(v: string): v is MonitorTapeEventType {
  return TYPE_SET.has(v);
}

export function fingerprintFor(
  symbol: string,
  type: MonitorTapeEventType,
  atMs: number,
  bucketMs = 30_000
): string {
  const bucket = Math.floor(atMs / bucketMs);
  return `${symbol.toUpperCase()}|${type}|${bucket}`;
}

export function normalizeTapeSignal(
  signal: RawTapeSignal
): MonitorTapeItem | null {
  const symbol = String(signal.symbol ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "");
  if (!symbol || symbol.length > 12) return null;
  if (!isMonitorTapeEventType(signal.type)) return null;
  if (!Number.isFinite(signal.atMs)) return null;

  const cat = TAPE_EVENT_CATALOG[signal.type];
  const fingerprint = fingerprintFor(symbol, signal.type, signal.atMs);
  const id =
    signal.id?.trim() ||
    `tape_${symbol}_${signal.type}_${signal.atMs}_${fingerprint.split("|")[2]}`;

  return {
    id,
    schemaVersion: "tt.monitor.event_tape.v1",
    ruleVersion: MONITOR_EVENT_TAPE_VERSION,
    atMs: signal.atMs,
    symbol,
    type: signal.type,
    label: cat.label,
    explanation: composeExplanation(signal.type, signal.detail),
    severity: DEFAULT_SEVERITY[signal.type],
    sourceType: cat.sourceType,
    dataConfidence: signal.dataConfidence ?? "medium",
    fingerprint,
    clusterId: null,
    clusterMemberIds: [id],
    intelSection: cat.intelSection,
    sourceName: signal.sourceName ?? null,
    sourceUrl: signal.sourceUrl ?? null,
  };
}
