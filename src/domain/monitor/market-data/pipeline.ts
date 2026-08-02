import {
  applyEntitlementsToEvent,
  type EntitlementError,
} from "./entitlements.ts";
import { MarketDataSequencer } from "./sequencing.ts";
import { validateMarketEvent } from "./validate.ts";
import type {
  BackfillRequest,
  IngestResult,
  MarketDataPlanEntitlements,
  NormalizedMarketEvent,
  SequenceDecision,
} from "./types.ts";
import type { MarketDataProvider } from "./ports.ts";

export interface PipelineOptions {
  plan: MarketDataPlanEntitlements;
  /** Accept events that arrive after a gap (still reports sequence_gap). */
  acceptAfterGap?: boolean;
  nowMs?: () => number;
  onGap?: (req: BackfillRequest, providerId: string) => void;
}

/**
 * Validate → entitlement filter → sequence → emit.
 * Vendor-agnostic ingest path for Monitor.
 */
export class MarketDataIngestPipeline {
  private readonly sequencer = new MarketDataSequencer();
  private readonly plan: MarketDataPlanEntitlements;
  private readonly acceptAfterGap: boolean;
  private readonly nowMs: () => number;
  private readonly onGap?: PipelineOptions["onGap"];
  private readonly listeners = new Set<(e: NormalizedMarketEvent) => void>();

  constructor(opts: PipelineOptions) {
    this.plan = opts.plan;
    this.acceptAfterGap = opts.acceptAfterGap !== false;
    this.nowMs = opts.nowMs ?? (() => Date.now());
    this.onGap = opts.onGap;
  }

  resetSequencer(): void {
    this.sequencer.reset();
  }

  onAccepted(listener: (e: NormalizedMarketEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Ingest a raw or already-shaped event from any provider adapter.
   * @param allowGapFill — accept sequences that fill a prior gap (backfill).
   */
  ingest(raw: unknown, opts?: { allowGapFill?: boolean }): IngestResult {
    const validated = validateMarketEvent(raw, { nowMs: this.nowMs() });
    if (!validated.ok) {
      return { ok: false, errors: validated.errors, warnings: [] };
    }

    const entitled = applyEntitlementsToEvent(validated.event, this.plan);
    if (!entitled) {
      return {
        ok: false,
        errors: ["entitlement:filtered"],
        warnings: [],
      };
    }

    // Stamp delayed when entitlement says delayed
    let event = entitled;
    if (
      event.dataEntitlement === "delayed" &&
      (event.delayedByMs == null || event.delayedByMs <= 0) &&
      this.plan.delayMsWhenDelayed
    ) {
      event = { ...event, delayedByMs: this.plan.delayMsWhenDelayed };
    }

    const sequence = this.sequencer.inspect(event, {
      allowGapFill: opts?.allowGapFill,
    });
    return this.finish(event, sequence);
  }

  private finish(
    event: NormalizedMarketEvent,
    sequence: SequenceDecision
  ): IngestResult {
    const warnings: string[] = [];

    if (sequence.disposition === "duplicate") {
      return {
        ok: false,
        errors: [`sequence:${sequence.reason}`],
        sequence,
        warnings,
      };
    }

    if (sequence.disposition === "out_of_order") {
      return {
        ok: false,
        errors: [`sequence:${sequence.reason}`],
        sequence,
        warnings,
      };
    }

    if (sequence.disposition === "sequence_gap") {
      warnings.push(
        `sequence_gap:${sequence.gapFrom}-${sequence.gapTo}`
      );
      if (this.onGap && sequence.gapFrom != null && sequence.gapTo != null) {
        const channel =
          event.type === "nbbo_quote"
            ? "nbbo"
            : event.type === "aggregate_1s"
              ? "aggregate_1s"
              : event.type === "aggregate_1m"
                ? "aggregate_1m"
                : "trades";
        this.onGap(
          {
            symbol: event.symbol,
            fromSequence: sequence.gapFrom,
            toSequence: sequence.gapTo,
            channel,
          },
          String(event.provider)
        );
      }
      if (!this.acceptAfterGap) {
        return {
          ok: false,
          errors: ["sequence:gap_not_accepted"],
          sequence,
          warnings,
        };
      }
    }

    this.sequencer.commit(event);
    for (const l of this.listeners) l(event);
    return { ok: true, event, sequence, warnings };
  }

  /** Wire a provider's onEvent into this pipeline. */
  bindProvider(provider: MarketDataProvider): () => void {
    return provider.onEvent((event) => {
      this.ingest(event);
    });
  }
}

export type { EntitlementError };
