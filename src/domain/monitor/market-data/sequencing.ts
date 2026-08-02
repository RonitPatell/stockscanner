import type {
  NormalizedMarketEvent,
  SequenceDecision,
} from "./types.ts";

type StreamKey = string;

interface StreamState {
  lastSequence: number | null;
  seenSequences: Set<number>;
  lastEventTimeMs: number | null;
  /** Content fingerprints for duplicate detection when sequence repeats incorrectly */
  recentFingerprints: Set<string>;
}

function streamKey(event: NormalizedMarketEvent): StreamKey {
  return `${event.provider}|${event.symbol}|${event.type}`;
}

function fingerprint(event: NormalizedMarketEvent): string {
  switch (event.type) {
    case "trade":
      return `${event.sequenceNumber}|${event.sipTimestamp}|${event.price}|${event.size}|${event.exchange}`;
    case "nbbo_quote":
      return `${event.sequenceNumber}|${event.sipTimestamp}|${event.bidPrice}|${event.askPrice}|${event.bidSize}|${event.askSize}`;
    case "aggregate_1s":
    case "aggregate_1m":
      return `${event.sequenceNumber}|${event.windowStart}|${event.windowEnd}|${event.close}|${event.volume}`;
    case "luld":
    case "halt":
    case "symbol_status":
      return `${event.sequenceNumber}|${event.type}|${"eventAt" in event ? event.eventAt : ""}`;
    case "connection_health":
      return `${event.sequenceNumber}|${event.state}|${event.attempt ?? ""}`;
    default:
      return String(event.sequenceNumber);
  }
}

function eventTimeMs(event: NormalizedMarketEvent): number | null {
  switch (event.type) {
    case "trade":
      return Date.parse(event.sipTimestamp);
    case "nbbo_quote":
      return Date.parse(event.sipTimestamp);
    case "aggregate_1s":
    case "aggregate_1m":
      return Date.parse(event.windowEnd);
    case "luld":
    case "halt":
    case "symbol_status":
      return Date.parse(event.eventAt);
    default:
      return null;
  }
}

/**
 * Per-provider / symbol / channel sequencer.
 * Detects duplicates, out-of-order timestamps, and sequence gaps.
 */
export class MarketDataSequencer {
  private readonly streams = new Map<StreamKey, StreamState>();
  private readonly maxSeen: number;

  constructor(opts?: { maxSeenPerStream?: number }) {
    this.maxSeen = opts?.maxSeenPerStream ?? 4_096;
  }

  reset(): void {
    this.streams.clear();
  }

  inspect(
    event: NormalizedMarketEvent,
    opts?: { allowGapFill?: boolean }
  ): SequenceDecision {
    // Connection health is not gap-checked against trade sequences
    if (event.type === "connection_health") {
      return { disposition: "accept", reason: "connection_health" };
    }

    const key = streamKey(event);
    let state = this.streams.get(key);
    if (!state) {
      state = {
        lastSequence: null,
        seenSequences: new Set(),
        lastEventTimeMs: null,
        recentFingerprints: new Set(),
      };
      this.streams.set(key, state);
    }

    const fp = fingerprint(event);
    if (
      state.seenSequences.has(event.sequenceNumber) ||
      state.recentFingerprints.has(fp)
    ) {
      return {
        disposition: "duplicate",
        reason: "duplicate_sequence_or_fingerprint",
        expectedSequence:
          state.lastSequence != null ? state.lastSequence + 1 : null,
      };
    }

    const t = eventTimeMs(event);
    if (
      t != null &&
      state.lastEventTimeMs != null &&
      t < state.lastEventTimeMs &&
      (state.lastSequence == null ||
        event.sequenceNumber <= state.lastSequence) &&
      !opts?.allowGapFill
    ) {
      return {
        disposition: "out_of_order",
        reason: "event_time_before_last_accepted",
        expectedSequence:
          state.lastSequence != null ? state.lastSequence + 1 : null,
      };
    }

    if (state.lastSequence != null) {
      const expected = state.lastSequence + 1;
      if (event.sequenceNumber > expected) {
        return {
          disposition: "sequence_gap",
          reason: "sequence_gap",
          expectedSequence: expected,
          gapFrom: expected,
          gapTo: event.sequenceNumber - 1,
        };
      }
      if (event.sequenceNumber < expected) {
        // Backfill of a previously gapped sequence
        if (
          opts?.allowGapFill &&
          !state.seenSequences.has(event.sequenceNumber)
        ) {
          return { disposition: "accept", reason: "gap_fill" };
        }
        return {
          disposition: "out_of_order",
          reason: "sequence_behind_last",
          expectedSequence: expected,
        };
      }
    }

    return { disposition: "accept", reason: "in_order" };
  }

  /** Commit an accepted (or gap-accepted) event into stream state. */
  commit(event: NormalizedMarketEvent): void {
    if (event.type === "connection_health") return;
    const key = streamKey(event);
    let state = this.streams.get(key);
    if (!state) {
      state = {
        lastSequence: null,
        seenSequences: new Set(),
        lastEventTimeMs: null,
        recentFingerprints: new Set(),
      };
      this.streams.set(key, state);
    }
    if (
      state.lastSequence == null ||
      event.sequenceNumber > state.lastSequence
    ) {
      state.lastSequence = event.sequenceNumber;
    }
    state.seenSequences.add(event.sequenceNumber);
    if (state.seenSequences.size > this.maxSeen) {
      // Retain high-water mark; drop older membership (approximate LRU)
      const keep = state.lastSequence;
      state.seenSequences.clear();
      if (keep != null) state.seenSequences.add(keep);
      state.seenSequences.add(event.sequenceNumber);
    }
    const fp = fingerprint(event);
    state.recentFingerprints.add(fp);
    if (state.recentFingerprints.size > this.maxSeen) {
      state.recentFingerprints.clear();
      state.recentFingerprints.add(fp);
    }
    const t = eventTimeMs(event);
    if (t != null) {
      if (state.lastEventTimeMs == null || t >= state.lastEventTimeMs) {
        state.lastEventTimeMs = t;
      }
    }
  }
}
