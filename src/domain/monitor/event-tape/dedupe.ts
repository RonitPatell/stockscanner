import { EVENT_TAPE_CONFIG, HYSTERESIS_PAIRS } from "./config.ts";
import type { MonitorTapeEventType, MonitorTapeItem } from "./types.ts";

export interface DedupeState {
  /** fingerprint → last accepted atMs */
  lastByFingerprint: Map<string, number>;
  /** symbol|type → last accepted atMs */
  lastBySymbolType: Map<string, number>;
}

export function createDedupeState(): DedupeState {
  return {
    lastByFingerprint: new Map(),
    lastBySymbolType: new Map(),
  };
}

function symbolTypeKey(symbol: string, type: MonitorTapeEventType): string {
  return `${symbol}|${type}`;
}

function oppositeOf(type: MonitorTapeEventType): MonitorTapeEventType | null {
  for (const [a, b] of HYSTERESIS_PAIRS) {
    if (a === type) return b;
    if (b === type) return a;
  }
  return null;
}

export type DedupeDecision =
  | { ok: true }
  | { ok: false; reason: "duplicate" | "cooldown" | "hysteresis" };

/**
 * Cooldown + hysteresis gate. Exact fingerprint repeats within cooldown → duplicate.
 * Opposite lifecycle flips within hysteresisMs → hysteresis drop.
 */
export function decideDedupe(
  item: MonitorTapeItem,
  state: DedupeState,
  opts?: { cooldownMs?: number; hysteresisMs?: number; nowMs?: number }
): DedupeDecision {
  const cooldownMs = opts?.cooldownMs ?? EVENT_TAPE_CONFIG.cooldownMs;
  const hysteresisMs = opts?.hysteresisMs ?? EVENT_TAPE_CONFIG.hysteresisMs;
  const now = opts?.nowMs ?? item.atMs;

  const prevFp = state.lastByFingerprint.get(item.fingerprint);
  if (prevFp != null && now - prevFp < cooldownMs) {
    return { ok: false, reason: "duplicate" };
  }

  const stKey = symbolTypeKey(item.symbol, item.type);
  const prevType = state.lastBySymbolType.get(stKey);
  if (prevType != null && now - prevType < cooldownMs) {
    return { ok: false, reason: "cooldown" };
  }

  const opp = oppositeOf(item.type);
  if (opp) {
    const oppAt = state.lastBySymbolType.get(symbolTypeKey(item.symbol, opp));
    if (oppAt != null && now - oppAt < hysteresisMs) {
      return { ok: false, reason: "hysteresis" };
    }
  }

  return { ok: true };
}

export function rememberAccepted(item: MonitorTapeItem, state: DedupeState): void {
  state.lastByFingerprint.set(item.fingerprint, item.atMs);
  state.lastBySymbolType.set(
    symbolTypeKey(item.symbol, item.type),
    item.atMs
  );
}

/** Prune dedupe maps older than retention to bound memory. */
export function pruneDedupeState(
  state: DedupeState,
  nowMs: number,
  retainMs = EVENT_TAPE_CONFIG.retentionMs
): void {
  const cutoff = nowMs - retainMs;
  for (const [k, t] of state.lastByFingerprint) {
    if (t < cutoff) state.lastByFingerprint.delete(k);
  }
  for (const [k, t] of state.lastBySymbolType) {
    if (t < cutoff) state.lastBySymbolType.delete(k);
  }
}
