import { MONITOR_MARKET_DATA_VERSION } from "./version.ts";
import type {
  ConnectionState,
  MarketDataProviderId,
  NormalizedConnectionHealth,
} from "./types.ts";

let healthSeq = 0;

export function nextHealthSequence(): number {
  healthSeq += 1;
  return healthSeq;
}

export function __resetHealthSequenceForTests(): void {
  healthSeq = 0;
}

export function buildConnectionHealth(input: {
  provider: MarketDataProviderId;
  state: ConnectionState;
  attempt?: number | null;
  nextRetryMs?: number | null;
  lastError?: string | null;
  subscribedSymbols?: string[];
  notes?: string | null;
  nowIso?: string;
  sequenceNumber?: number;
}): NormalizedConnectionHealth {
  const now = input.nowIso ?? new Date().toISOString();
  return {
    type: "connection_health",
    schemaVersion: MONITOR_MARKET_DATA_VERSION,
    symbol: "*",
    provider: input.provider,
    sequenceNumber: input.sequenceNumber ?? nextHealthSequence(),
    providerReceivedAt: now,
    trustTickerReceivedAt: now,
    dataEntitlement: "status_only",
    delayedByMs: null,
    state: input.state,
    attempt: input.attempt ?? null,
    nextRetryMs: input.nextRetryMs ?? null,
    lastError: input.lastError ?? null,
    subscribedSymbols: input.subscribedSymbols,
    notes: input.notes ?? null,
  };
}
