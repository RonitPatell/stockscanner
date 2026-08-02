import { tradingViewUrl } from "../../../lib/chart-links.ts";
import { safeHttpUrl } from "../../../lib/utils.ts";
import type { MonitorLadderRow } from "../monitor-types.ts";
import {
  availNum,
  availText,
  formatAgeLabel,
  formatEtTime,
  stickMonitorNumber,
  stickMonitorText,
  unavailableNum,
  unavailableText,
} from "./selected-ticker-format.ts";
import {
  MONITOR_PRIMARY_RISK_KINDS,
  MONITOR_SELECTED_TICKER_DISCLAIMER,
  type MonitorPrimaryRisk,
  type MonitorRiskKind,
  type MonitorRiskStatus,
  type MonitorSelectedTicker,
  type MonitorTimelineEvent,
} from "./selected-ticker-types.ts";

/** Optional catalyst / microstructure seed (fixtures or live projectors). */
export interface SelectedTickerSeed {
  company?: string | null;
  price?: number | null;
  sessionChangePct?: number | null;
  reactionStage?: string | null;
  tradeability?: string | null;
  dataConfidence?: string | null;
  catalyst?: {
    fact?: string | null;
    sourceName?: string | null;
    sourceUrl?: string | null;
    publishedAt?: string | null;
    firstSeenAt?: string | null;
    confirmationLevel?: string | null;
    ageSec?: number | null;
  } | null;
  /**
   * Price observed at catalyst time. Must remain unavailable when unknown —
   * never backfill from current price.
   */
  priceAtCatalyst?: number | null;
  tradesPerSecond?: number | null;
  dollarVolumeVelocity?: number | null;
  relativeVolume?: number | null;
  spreadDollars?: number | null;
  spreadBps?: number | null;
  hodContext?: string | null;
  lodContext?: string | null;
  vwapContext?: string | null;
  risks?: Partial<
    Record<MonitorRiskKind, { status: MonitorRiskStatus; detail?: string | null }>
  >;
  timeline?: MonitorTimelineEvent[];
  evidence?: {
    primarySource?: string | null;
    primarySourceUrl?: string | null;
    secFilings?: string[];
    supportingFacts?: string[];
    missingOrUncertain?: string[];
  };
  collapsed?: {
    historicalAnalogues?: string | null;
    personalFeedback?: string | null;
    autopsy?: string | null;
    additionalMarketStatistics?: string[];
  };
}

function directionalImplication(
  direction: MonitorLadderRow["direction"]
): string {
  if (direction === "up") {
    return "Tape bias upward — inspect continuation / fade risk";
  }
  if (direction === "down") {
    return "Tape bias downward — inspect continuation / reclaim risk";
  }
  return "No clear directional tape bias";
}

function buildRisks(
  seed: SelectedTickerSeed | undefined,
  halted: boolean
): MonitorPrimaryRisk[] {
  return MONITOR_PRIMARY_RISK_KINDS.map(({ kind, label }) => {
    const fromSeed = seed?.risks?.[kind];
    if (fromSeed) {
      return {
        kind,
        label,
        status: fromSeed.status,
        detail: fromSeed.detail ?? null,
      };
    }
    if (kind === "halt") {
      return {
        kind,
        label,
        status: halted ? "active" : "clear",
        detail: halted ? "Trading halt active on ladder" : null,
      };
    }
    return {
      kind,
      label,
      status: "unavailable",
      detail: null,
    };
  });
}

/**
 * Project ladder + optional intelligence seed into the fixed Monitor dossier.
 * Missing event prices stay Unavailable — never replaced by current price.
 */
export function buildSelectedTicker(opts: {
  row: MonitorLadderRow;
  pinned: boolean;
  seed?: SelectedTickerSeed | null;
  freshnessMs?: number | null;
}): MonitorSelectedTicker {
  const { row, pinned, seed, freshnessMs } = opts;
  const cat = seed?.catalyst ?? null;
  const hasCatalystFact = !!(cat?.fact && String(cat.fact).trim());

  const price = seed?.price ?? null;
  const priceAtCatalyst = seed?.priceAtCatalyst ?? null;

  // Move since catalyst requires BOTH prices — never invent from session change.
  const moveSinceCatalyst =
    priceAtCatalyst != null &&
    price != null &&
    Number.isFinite(priceAtCatalyst) &&
    Number.isFinite(price) &&
    priceAtCatalyst > 0
      ? ((price - priceAtCatalyst) / priceAtCatalyst) * 100
      : null;

  const dataConfidence =
    seed?.dataConfidence ??
    (freshnessMs != null && freshnessMs > 30_000
      ? "Low — delayed or stale tape"
      : freshnessMs != null && freshnessMs > 8_000
        ? "Reduced — elevated event lag"
        : "Adequate for inspection");

  const primarySourceUrl = safeHttpUrl(
    seed?.evidence?.primarySourceUrl ?? cat?.sourceUrl ?? null
  );
  const catalystSourceUrl = safeHttpUrl(cat?.sourceUrl ?? null);

  return {
    symbol: row.symbol,
    identity: {
      ticker: row.symbol,
      company: availText(seed?.company ?? null, {
        note: "company_name",
      }),
      price: availNum(price, { note: "last_price" }),
      sessionChangePct: availNum(seed?.sessionChangePct ?? null, {
        note: "session_change",
      }),
      momentumRank: availNum(row.rank, { note: "ladder_rank" }),
      pinned,
    },
    currentState: {
      momentumState: availText(row.momentumState),
      momentumIntensity: availNum(row.momentumIntensity),
      attentionPriority: availNum(row.attentionPriority),
      directionalImplication: availText(
        directionalImplication(row.direction)
      ),
      reactionStage: availText(seed?.reactionStage ?? null, {
        note: "reaction_stage",
      }),
      tradeability: availText(seed?.tradeability ?? null, {
        note: "tradeability",
      }),
      dataConfidence: availText(dataConfidence),
    },
    verifiedCatalyst: {
      present: hasCatalystFact || !!row.hasCatalyst,
      oneSentenceFact: availText(cat?.fact ?? null, { note: "catalyst_fact" }),
      sourceName: availText(cat?.sourceName ?? null, { note: "source" }),
      sourceUrl: catalystSourceUrl,
      publicationTime: availText(formatEtTime(cat?.publishedAt ?? null), {
        note: "publication_time",
      }),
      firstSeenTime: availText(formatEtTime(cat?.firstSeenAt ?? null), {
        note: "first_seen",
      }),
      confirmationLevel: availText(cat?.confirmationLevel ?? null, {
        note: "confirmation",
      }),
      catalystAge: availText(formatAgeLabel(cat?.ageSec ?? null), {
        note: "catalyst_age",
      }),
    },
    marketMovement: {
      priceAtCatalyst: availNum(priceAtCatalyst, {
        note: "price_at_catalyst",
      }),
      currentPrice: availNum(price, { note: "current_price" }),
      moveSinceCatalystPct: availNum(moveSinceCatalyst, {
        note:
          priceAtCatalyst == null
            ? "missing_event_price"
            : "move_since_catalyst",
      }),
      tradesPerSecond: availNum(seed?.tradesPerSecond ?? null),
      dollarVolumeVelocity: availNum(seed?.dollarVolumeVelocity ?? null),
      relativeVolume: availNum(seed?.relativeVolume ?? null),
      spreadDollars: availNum(seed?.spreadDollars ?? null),
      spreadBps: availNum(seed?.spreadBps ?? null),
      hodContext: availText(seed?.hodContext ?? null),
      lodContext: availText(seed?.lodContext ?? null),
      vwapContext: availText(seed?.vwapContext ?? null),
    },
    primaryRisks: buildRisks(seed ?? undefined, !!row.halted),
    eventTimeline: seed?.timeline?.length
      ? seed.timeline
      : [
          {
            id: `${row.symbol}-state`,
            atMs: Date.now(),
            kind: "momentum_transition" as const,
            summary: `${row.symbol} · ${row.momentumState} · ${row.reason}`,
          },
        ],
    evidence: {
      primarySource: availText(
        seed?.evidence?.primarySource ?? cat?.sourceName ?? null
      ),
      primarySourceUrl,
      secFilings: (seed?.evidence?.secFilings ?? []).map((f) => availText(f)),
      supportingFacts: (seed?.evidence?.supportingFacts ?? []).map((f) =>
        availText(f)
      ),
      missingOrUncertain: (
        seed?.evidence?.missingOrUncertain ??
        (priceAtCatalyst == null && hasCatalystFact
          ? ["Price at catalyst time not captured — move since catalyst unavailable"]
          : [])
      ).map((f) => availText(f)),
    },
    collapsed: {
      historicalAnalogues: availText(
        seed?.collapsed?.historicalAnalogues ?? null,
        { note: "analogues" }
      ),
      personalFeedback: availText(seed?.collapsed?.personalFeedback ?? null, {
        note: "feedback",
      }),
      autopsy: availText(seed?.collapsed?.autopsy ?? null, { note: "autopsy" }),
      additionalMarketStatistics: (
        seed?.collapsed?.additionalMarketStatistics ?? []
      ).map((s) => availText(s)),
    },
    actions: {
      tradingViewUrl: tradingViewUrl(row.symbol),
      sourceUrl: primarySourceUrl, // already allowlisted http(s)
    },
    disclaimer: MONITOR_SELECTED_TICKER_DISCLAIMER,
  };
}

/**
 * Merge a live dossier update onto a sticky prior for the same symbol.
 * Event prices stick independently and are never filled from currentPrice.
 */
export function stickSelectedTicker(
  prev: MonitorSelectedTicker | null,
  next: MonitorSelectedTicker
): MonitorSelectedTicker {
  if (!prev || prev.symbol !== next.symbol) return next;

  const priceAtCatalyst = stickMonitorNumber(
    prev.marketMovement.priceAtCatalyst,
    next.marketMovement.priceAtCatalyst
  );
  const currentPrice = stickMonitorNumber(
    prev.marketMovement.currentPrice,
    next.marketMovement.currentPrice
  );

  // Recompute move only when both event + current are present — never invent.
  let moveSinceCatalystPct = next.marketMovement.moveSinceCatalystPct;
  if (
    priceAtCatalyst.availability !== "unavailable" &&
    priceAtCatalyst.value != null &&
    priceAtCatalyst.value > 0 &&
    currentPrice.availability !== "unavailable" &&
    currentPrice.value != null
  ) {
    moveSinceCatalystPct = availNum(
      ((currentPrice.value - priceAtCatalyst.value) / priceAtCatalyst.value) *
        100
    );
  } else if (
    next.marketMovement.moveSinceCatalystPct.availability === "unavailable"
  ) {
    // Keep prior move only if it was computed from a real event price.
    moveSinceCatalystPct = stickMonitorNumber(
      prev.marketMovement.moveSinceCatalystPct,
      next.marketMovement.moveSinceCatalystPct
    );
  }

  return {
    ...next,
    identity: {
      ...next.identity,
      company: stickMonitorText(prev.identity.company, next.identity.company),
      price: stickMonitorNumber(prev.identity.price, next.identity.price),
      sessionChangePct: stickMonitorNumber(
        prev.identity.sessionChangePct,
        next.identity.sessionChangePct
      ),
      pinned: next.identity.pinned,
    },
    currentState: {
      ...next.currentState,
      reactionStage: stickMonitorText(
        prev.currentState.reactionStage,
        next.currentState.reactionStage
      ),
      tradeability: stickMonitorText(
        prev.currentState.tradeability,
        next.currentState.tradeability
      ),
    },
    verifiedCatalyst: {
      ...next.verifiedCatalyst,
      oneSentenceFact: stickMonitorText(
        prev.verifiedCatalyst.oneSentenceFact,
        next.verifiedCatalyst.oneSentenceFact
      ),
      sourceName: stickMonitorText(
        prev.verifiedCatalyst.sourceName,
        next.verifiedCatalyst.sourceName
      ),
      publicationTime: stickMonitorText(
        prev.verifiedCatalyst.publicationTime,
        next.verifiedCatalyst.publicationTime
      ),
      firstSeenTime: stickMonitorText(
        prev.verifiedCatalyst.firstSeenTime,
        next.verifiedCatalyst.firstSeenTime
      ),
      confirmationLevel: stickMonitorText(
        prev.verifiedCatalyst.confirmationLevel,
        next.verifiedCatalyst.confirmationLevel
      ),
      catalystAge: stickMonitorText(
        prev.verifiedCatalyst.catalystAge,
        next.verifiedCatalyst.catalystAge
      ),
      sourceUrl:
        next.verifiedCatalyst.sourceUrl ?? prev.verifiedCatalyst.sourceUrl,
    },
    marketMovement: {
      ...next.marketMovement,
      priceAtCatalyst,
      currentPrice,
      moveSinceCatalystPct,
      tradesPerSecond: stickMonitorNumber(
        prev.marketMovement.tradesPerSecond,
        next.marketMovement.tradesPerSecond
      ),
      dollarVolumeVelocity: stickMonitorNumber(
        prev.marketMovement.dollarVolumeVelocity,
        next.marketMovement.dollarVolumeVelocity
      ),
      relativeVolume: stickMonitorNumber(
        prev.marketMovement.relativeVolume,
        next.marketMovement.relativeVolume
      ),
      spreadDollars: stickMonitorNumber(
        prev.marketMovement.spreadDollars,
        next.marketMovement.spreadDollars
      ),
      spreadBps: stickMonitorNumber(
        prev.marketMovement.spreadBps,
        next.marketMovement.spreadBps
      ),
      hodContext: stickMonitorText(
        prev.marketMovement.hodContext,
        next.marketMovement.hodContext
      ),
      lodContext: stickMonitorText(
        prev.marketMovement.lodContext,
        next.marketMovement.lodContext
      ),
      vwapContext: stickMonitorText(
        prev.marketMovement.vwapContext,
        next.marketMovement.vwapContext
      ),
    },
    evidence: {
      ...next.evidence,
      primarySource: stickMonitorText(
        prev.evidence.primarySource,
        next.evidence.primarySource
      ),
      primarySourceUrl:
        next.evidence.primarySourceUrl ?? prev.evidence.primarySourceUrl,
      secFilings:
        next.evidence.secFilings.length > 0
          ? next.evidence.secFilings
          : prev.evidence.secFilings,
      supportingFacts:
        next.evidence.supportingFacts.length > 0
          ? next.evidence.supportingFacts
          : prev.evidence.supportingFacts,
    },
    actions: {
      tradingViewUrl: next.actions.tradingViewUrl,
      sourceUrl: next.actions.sourceUrl ?? prev.actions.sourceUrl,
    },
  };
}

/** Convenience: empty unavailable shells for tests. */
export function emptySeed(): SelectedTickerSeed {
  return {};
}

export { unavailableNum, unavailableText };
