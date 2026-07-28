import type { CatalystItem } from "@/types";
import type { JudgmentV2 } from "../judgment/types.ts";
import { marketSessionAt } from "../latency-trace/timestamps.ts";
import { tradingViewUrl } from "../chart-links.ts";
import {
  avail,
  unavailable,
  classifyLiquidity,
  pctMove,
  distancePct,
  ageSec,
} from "./format.ts";
import { computeReactionStageEngine } from "../reaction-stage/engine.ts";
import type { ReactionStage as EngineStage } from "../reaction-stage/types.ts";
import { computeTradeability } from "../tradeability/engine.ts";
import { SLIPPAGE_DISCLAIMER } from "../tradeability/version.ts";
import { computeReactionStage } from "./reaction-stage.ts";
import { buildDecisionRisks } from "./risks.ts";
import {
  DECISION_CARD_DISCLAIMER,
  DECISION_CARD_V3_VERSION,
  type DecisionCardV3Model,
  type MarketSessionLabel,
  type SourceClass,
  type TimestampQualityLabel,
} from "./types.ts";

const SCHEDULED_RE =
  /\b(scheduled|will\s+(report|announce|host)|upcoming|set\s+to\s+(report|announce))\b/i;
const STALE_RE =
  /\b(as\s+previously\s+(announced|reported|disclosed)|reiterates?|previously\s+disclosed)\b/i;
const HALT_RE = /\b(trading\s+halt|halted|luld)\b/i;

const PRIMARY_SOURCES = new Set([
  "sec edgar",
  "globe newswire",
  "business wire",
  "pr newswire",
  "accesswire",
]);

export interface DecisionCardLiveTape {
  price?: number | null;
  changePercent?: number | null;
  volume?: number | null;
  avgVolume?: number | null;
  rVol?: number | null;
  floatShares?: number | null;
  dayHigh?: number | null;
  /** Quote age in seconds when known */
  quoteAgeSec?: number | null;
  /** Licensed L1 — usually unavailable */
  bid?: number | null;
  ask?: number | null;
  bidSize?: number | null;
  askSize?: number | null;
  spreadDollars?: number | null;
  vwap?: number | null;
  premarketHigh?: number | null;
  volAccel1m?: number | null;
  volAccel5m?: number | null;
  sessionHaltCount?: number | null;
}

export interface DecisionCardEnrichment {
  companyName?: string | null;
  exchange?: string | null;
  /** From LatencyTrace when joined */
  timestampQuality?: TimestampQualityLabel | null;
  /** CatalystOutcome / backfill snapshots */
  priceAtPublication?: number | null;
  priceAtIngest?: number | null;
  /** Dilution Radar instrument types for symbol */
  dilutionTypes?: string[];
  dilutionEvidenceUrl?: string | null;
  nowMs?: number;
  live?: DecisionCardLiveTape | null;
  /** Official halt monitor card (from halt-monitor store) */
  haltMonitor?: DecisionCardV3Model["haltMonitor"];
  /** User illustrative order notionals for tradeability slippage (not real orders) */
  illustrativeOrderNotionalsUsd?: number[];
  /** Licensed L1 depth entitlement override */
  hasLicensedDepth?: boolean;
}

function sessionLabel(when: Date | string | null | undefined): MarketSessionLabel {
  const d = when instanceof Date ? when : when ? new Date(when) : null;
  const s = marketSessionAt(d);
  if (!s) return "unknown";
  if (s === "weekend") return "weekend";
  if (s === "premarket") return "premarket";
  if (s === "regular") return "regular";
  return "afterhours";
}

function sourceClass(source: string, tier?: string | null): SourceClass {
  const s = source.toLowerCase().replace(/\s+/g, " ").trim();
  const compact = s.replace(/[\s_-]+/g, "");
  if (
    PRIMARY_SOURCES.has(s) ||
    compact.includes("secedgar") ||
    compact.includes("globenewswire") ||
    compact.includes("businesswire") ||
    compact.includes("prnewswire") ||
    compact.includes("accesswire")
  ) {
    return "primary";
  }
  if (tier === "wire" || tier === "issuer") return "primary";
  if (tier === "aggregator" || tier === "social") return "secondary";
  if (s.includes("yahoo") || s.includes("benzinga") || s.includes("seeking")) return "secondary";
  return "unknown";
}

function subtypeFrom(c: CatalystItem): string | null {
  const h = c.headline ?? "";
  if (/424b5|prospectus/i.test(h)) return "prospectus_supplement";
  if (/registered\s+direct/i.test(h)) return "registered_direct";
  if (/atm|at-the-market/i.test(h)) return "atm";
  if (/form\s*8-k|8-k/i.test(h)) return "form_8k";
  if (/form\s*4/i.test(h)) return "form_4";
  if (/fda|clearance|approval/i.test(h)) return "regulatory";
  return null;
}

function factSummary(c: CatalystItem, judgment?: JudgmentV2 | null): string {
  const facts = judgment?.verifiedFacts?.filter(Boolean) ?? [];
  if (facts[0]) return facts[0]!.slice(0, 180);
  if (c.aiSummary) return c.aiSummary.split(/[.…]/)[0]!.slice(0, 180);
  return c.headline.slice(0, 180);
}

/**
 * Pure projector — safe for unit tests and <100ms local profiling.
 * Missing market microstructure → availability: unavailable (never invented).
 */
export function projectDecisionCardV3(
  catalyst: CatalystItem,
  enrichment: DecisionCardEnrichment = {}
): DecisionCardV3Model {
  const now = enrichment.nowMs ?? Date.now();
  const live = enrichment.live ?? {};
  const judgment = catalyst.judgmentV2 ?? null;

  const price = live.price ?? catalyst.price ?? null;
  const changePercent = live.changePercent ?? catalyst.changePercent ?? null;
  const volume = live.volume ?? catalyst.volume ?? null;
  const avgVolume = live.avgVolume ?? catalyst.avgVolume ?? null;
  const rVol = live.rVol ?? catalyst.rVol ?? null;
  const floatShares = live.floatShares ?? catalyst.floatShares ?? null;
  const dayHigh = live.dayHigh ?? null;

  const publishedAt = catalyst.publishedAt ?? null;
  const firstSeenAt = catalyst.ingestedAt ?? catalyst.publishedAt ?? null;
  const age = ageSec(publishedAt, now);

  // Prefer measured publication / ingest marks; otherwise estimate a session
  // reference from current price + day change so move % is never blank when
  // the feed already shows a price and % move.
  let priceAtPub = enrichment.priceAtPublication ?? null;
  let priceAtPubEstimated = false;
  let priceAtIngest = enrichment.priceAtIngest ?? null;
  if (
    priceAtPub == null &&
    price != null &&
    price > 0 &&
    changePercent != null &&
    Number.isFinite(changePercent)
  ) {
    const denom = 1 + changePercent / 100;
    if (Math.abs(denom) > 0.05) {
      priceAtPub = price / denom;
      priceAtPubEstimated = true;
    }
  }
  if (priceAtIngest == null && price != null && price > 0) {
    // First card snapshot — sticky until a true ingest mark arrives
    priceAtIngest = priceAtPub ?? price;
  }

  const text = `${catalyst.headline} ${catalyst.aiSummary ?? ""}`;
  const halted = HALT_RE.test(text);

  let spreadDollars = live.spreadDollars ?? null;
  let spreadBps: number | null = null;
  if (spreadDollars == null && live.bid != null && live.ask != null && live.bid > 0) {
    spreadDollars = live.ask - live.bid;
  }
  if (spreadDollars != null && price != null && price > 0) {
    spreadBps = (spreadDollars / price) * 10_000;
  }

  const dollarVolume =
    price != null && volume != null && price > 0 && volume > 0 ? price * volume : null;

  const haltFromMonitor = enrichment.haltMonitor;

  const liquidity = classifyLiquidity({
    dollarVolume,
    spreadBps,
    rVol,
    floatShares,
  });

  // Tradeability Engine — authoritative class when tape present
  const tradeability = computeTradeability({
    symbol: catalyst.symbol,
    matchMethod: catalyst.matchMethod,
    floatSource: "profile_heuristic",
    marketSession: sessionLabel(firstSeenAt ?? publishedAt),
    illustrativeOrderNotionalsUsd: enrichment.illustrativeOrderNotionalsUsd,
    hasLicensedDepth: enrichment.hasLicensedDepth,
    nowMs: now,
    tape: {
      price,
      bid: live.bid,
      ask: live.ask,
      bidSize: live.bidSize,
      askSize: live.askSize,
      spreadDollars,
      spreadBps,
      quoteAgeSec: live.quoteAgeSec,
      volume,
      avgVolume,
      rVol,
      dollarVolume,
      volAccel: live.volAccel1m,
      floatShares,
      haltCount:
        haltFromMonitor?.sessionHaltCount ?? live.sessionHaltCount ?? null,
      vwap: live.vwap,
      dayHigh,
      premarketHigh: live.premarketHigh,
      dayMoveAbsPct: changePercent != null ? Math.abs(changePercent) : null,
    },
  });

  const liquidityFromEngine =
    tradeability.class === "UNKNOWN" ? "UNKNOWN" : tradeability.class;
  const liquidityFinal =
    liquidityFromEngine !== "UNKNOWN"
      ? liquidityFromEngine
      : liquidity === "UNAVAILABLE"
        ? "UNKNOWN"
        : liquidity;

  const moveSincePub = pctMove(priceAtPub, price);
  const moveSinceIngest = pctMove(priceAtIngest, price);
  // Prefer explicit day change from the tape when publication mark is estimated
  const moveSincePubFinal =
    priceAtPubEstimated && changePercent != null && Number.isFinite(changePercent)
      ? avail(changePercent, { estimated: true, note: "session_change_proxy" })
      : moveSincePub.availability === "unavailable" &&
          changePercent != null &&
          Number.isFinite(changePercent)
        ? avail(changePercent, { estimated: true, note: "session_change_proxy" })
        : priceAtPubEstimated
          ? avail(moveSincePub.value, { estimated: true, note: "session_reference" })
          : moveSincePub;

  const confirming =
    catalyst.newsCount != null && catalyst.newsCount > 0
      ? avail(Math.max(1, catalyst.newsCount))
      : catalyst.headlines && catalyst.headlines.length > 0
        ? avail(new Set(catalyst.headlines.map((h) => h.source)).size)
        : avail(1, { estimated: true, note: "single_source_assumed" });

  const confidence =
    catalyst.verifiedConfidence != null
      ? avail(catalyst.verifiedConfidence)
      : judgment?.confidence === "HIGH"
        ? avail(80, { estimated: true })
        : judgment?.confidence === "MEDIUM"
          ? avail(55, { estimated: true })
          : judgment?.confidence === "LOW"
            ? avail(30, { estimated: true })
            : unavailable("confidence_not_set");

  const tsQuality: TimestampQualityLabel =
    enrichment.timestampQuality ??
    (publishedAt ? "ESTIMATED_PROVIDER" : "MISSING");

  const missingCritical: string[] = [];
  if (price == null) missingCritical.push("current_price");
  if (floatShares == null) missingCritical.push("float");
  if (rVol == null) missingCritical.push("relative_volume");
  if (!catalyst.sourceUrl) missingCritical.push("source_url");

  const sessionHaltCountField =
    haltFromMonitor?.sessionHaltCount != null
      ? avail(haltFromMonitor.sessionHaltCount)
      : live.sessionHaltCount != null
        ? avail(live.sessionHaltCount)
        : unavailable("no_exchange_halt_feed");

  const identityHalted =
    halted || Boolean(haltFromMonitor?.active);
  const haltStatusLabel = haltFromMonitor?.active
    ? `${haltFromMonitor.haltCode}: ${haltFromMonitor.haltCodeTitle}`
    : halted
      ? "Halt language in catalyst text"
      : null;

  const risks = buildDecisionRisks({
    headline: catalyst.headline,
    summary: catalyst.aiSummary,
    catalystType: catalyst.catalystType,
    matchMethod: catalyst.matchMethod,
    verifiedConfidence: catalyst.verifiedConfidence,
    changePercent,
    judgment,
    dilutionTypes: enrichment.dilutionTypes,
    missingCritical,
  });

  const moveAbs =
    moveSincePub.value != null
      ? Math.abs(moveSincePub.value)
      : null;

  // Prefer deterministic Reaction Stage Engine v1; fall back to legacy rules if needed.
  const engine = computeReactionStageEngine({
    catalystId: catalyst.id,
    symbol: catalyst.symbol,
    headline: catalyst.headline,
    summary: catalyst.aiSummary,
    source: catalyst.source,
    category: catalyst.catalystType,
    floatShares,
    dollarVolume,
    providerPublishedAt: publishedAt,
    firstSeenAt,
    classifiedAt: judgment?.classifiedAt ?? null,
    ingestedAt: firstSeenAt,
    timestampQuality: tsQuality,
    judgmentTiming: judgment?.timing,
    priceAtPublication: priceAtPub,
    priceAtPublicationQuality: priceAtPub != null
      ? priceAtPubEstimated
        ? "substituted"
        : "ok"
      : "unavailable",
    priceAtIngestion: priceAtIngest,
    priceAtIngestionQuality: priceAtIngest != null ? "ok" : "unavailable",
    nowMs: now,
    tape: {
      currentPrice: price,
      dayChangePercent: changePercent,
      volume,
      avgVolume,
      rVol,
      dayHigh,
      vwap: live.vwap,
      premarketHigh: live.premarketHigh,
      bid: live.bid,
      ask: live.ask,
      spreadBps,
      quoteAgeSec: live.quoteAgeSec,
      volAccel: live.volAccel1m,
      realizedVol1mPct: live.volAccel1m != null ? null : null,
      haltCount: live.sessionHaltCount,
    },
  });

  const reactionStage = {
    stage: engine.stage as EngineStage,
    rules: engine.rules.map((r) => ({
      id: r.id,
      label: r.label,
      passed: r.passed,
      detail: r.detail,
    })),
    explanation: engine.explanation,
    conflictingEvidence: engine.conflictingEvidence,
    engineVersion: engine.engineVersion,
    timeline: engine.timeline,
    flappedSuppressed: engine.flappedSuppressed,
  };

  // Keep legacy helper referenced for tests that import it directly
  void computeReactionStage;

  const exchange = enrichment.exchange ?? null;

  return {
    version: DECISION_CARD_V3_VERSION,
    catalystId: catalyst.id,
    builtAt: new Date(now).toISOString(),
    identity: {
      symbol: catalyst.symbol.toUpperCase(),
      companyName: enrichment.companyName ?? null,
      exchange,
      marketSession: sessionLabel(firstSeenAt ?? publishedAt),
      price: avail(price),
      changePercent: avail(changePercent),
      halted: identityHalted,
      haltStatusLabel,
    },
    catalyst: {
      factSummary: factSummary(catalyst, judgment),
      category: catalyst.catalystType || "other",
      subtype: subtypeFrom(catalyst),
      sourceClass: sourceClass(catalyst.source, catalyst.sourceTier),
      sourceName: catalyst.source,
      sourceUrl: catalyst.sourceUrl ?? null,
      providerPublishedAt: publishedAt,
      firstSeenAt,
      ageSec: age,
      timestampQuality: tsQuality,
      classificationConfidence: confidence,
      confirmingSourceCount: confirming,
    },
    reaction: {
      priceAtPublication: priceAtPubEstimated
        ? avail(priceAtPub, { estimated: true, note: "session_reference" })
        : engine.metrics.priceAtPublication.availability !== "unavailable"
          ? engine.metrics.priceAtPublication
          : avail(priceAtPub),
      priceAtIngest:
        engine.metrics.priceAtIngestion.availability !== "unavailable"
          ? engine.metrics.priceAtIngestion
          : avail(priceAtIngest),
      currentPrice:
        engine.metrics.currentPrice.availability !== "unavailable"
          ? engine.metrics.currentPrice
          : avail(price),
      moveBeforePublicationPct: engine.metrics.pctMoveBeforePublication,
      moveSincePublicationPct:
        engine.metrics.pctMoveSincePublication.availability !== "unavailable" &&
        !priceAtPubEstimated
          ? engine.metrics.pctMoveSincePublication
          : moveSincePubFinal,
      moveSinceIngestPct:
        engine.metrics.pctMoveSinceIngestion.availability !== "unavailable"
          ? engine.metrics.pctMoveSinceIngestion
          : moveSinceIngest,
      relativeVolume:
        engine.metrics.relativeVolume.availability !== "unavailable"
          ? engine.metrics.relativeVolume
          : avail(rVol),
      volAccel1m: engine.metrics.volumeAcceleration,
      volAccel5m: avail(live.volAccel5m, { note: "requires_5m_bars" }),
      distanceFromVwapPct: engine.metrics.distanceFromVwapPct,
      distanceFromPremarketHighPct: engine.metrics.distanceFromPremarketHighPct,
      distanceFromSessionHighPct:
        engine.metrics.distanceFromHodPct.availability !== "unavailable"
          ? engine.metrics.distanceFromHodPct
          : distancePct(dayHigh, price),
    },
    tradeability: {
      spreadDollars: tradeability.metrics.absoluteSpread,
      spreadBps: tradeability.metrics.spreadBps,
      dollarVolume: tradeability.metrics.dollarVolume,
      bidSize: tradeability.metrics.bidSize,
      askSize: tradeability.metrics.askSize,
      floatShares: tradeability.metrics.floatShares,
      floatConfidence: tradeability.metrics.floatConfidence,
      liquidity: liquidityFinal,
      quoteFreshnessSec: tradeability.metrics.quoteAgeSec,
      sessionHaltCount: sessionHaltCountField,
      tradeabilityExplanation: tradeability.explanation,
      tradeabilityWarnings: tradeability.warnings
        .filter((w) => w.active)
        .map((w) => w.flag),
      missingTradeabilityInputs: tradeability.metrics.missingInputs,
      illustrativeSlippageNote: SLIPPAGE_DISCLAIMER,
    },
    risks,
    reactionStage,
    haltMonitor: haltFromMonitor ?? null,
    actions: {
      sourceUrl: catalyst.sourceUrl ?? null,
      tradingViewUrl: tradingViewUrl(catalyst.symbol, exchange),
    },
    disclaimer: DECISION_CARD_DISCLAIMER,
  };
}

/** Apply live tape onto an existing model and recompute reaction stage incrementally. */
export function patchDecisionCardLive(
  model: DecisionCardV3Model,
  live: DecisionCardLiveTape
): DecisionCardV3Model {
  const price = live.price ?? model.identity.price.value;
  const changePercent = live.changePercent ?? model.identity.changePercent.value;
  const rVol = live.rVol ?? model.reaction.relativeVolume.value;
  const floatShares = live.floatShares ?? model.tradeability.floatShares.value;
  const volume = live.volume ?? null;
  const dayHigh = live.dayHigh ?? null;

  let spreadDollars = live.spreadDollars ?? model.tradeability.spreadDollars.value;
  if (spreadDollars == null && live.bid != null && live.ask != null) {
    spreadDollars = live.ask - live.bid;
  }
  let spreadBps: number | null = null;
  if (spreadDollars != null && price != null && price > 0) {
    spreadBps = (spreadDollars / price) * 10_000;
  }
  const dollarVolume =
    price != null && volume != null && price > 0 && volume > 0
      ? price * volume
      : model.tradeability.dollarVolume.value;

  const priorStage = model.reactionStage.stage as EngineStage;
  const engine = computeReactionStageEngine({
    catalystId: model.catalystId,
    symbol: model.identity.symbol,
    headline: model.catalyst.factSummary,
    source: model.catalyst.sourceName,
    category: model.catalyst.category,
    floatShares,
    dollarVolume,
    providerPublishedAt: model.catalyst.providerPublishedAt,
    firstSeenAt: model.catalyst.firstSeenAt,
    timestampQuality: model.catalyst.timestampQuality,
    priceAtPublication: model.reaction.priceAtPublication.value,
    priceAtPublicationQuality:
      model.reaction.priceAtPublication.availability === "ok" ? "ok" : "unavailable",
    priceAtIngestion: model.reaction.priceAtIngest.value,
    priceAtIngestionQuality:
      model.reaction.priceAtIngest.availability === "ok" ? "ok" : "unavailable",
    previousStage: priorStage === "UNKNOWN" ? "UNKNOWN" : priorStage,
    previousStageAtMs: new Date(model.builtAt).getTime(),
    nowMs: Date.now(),
    tape: {
      currentPrice: price,
      dayChangePercent: changePercent,
      volume,
      rVol,
      dayHigh,
      vwap: live.vwap,
      premarketHigh: live.premarketHigh,
      bid: live.bid,
      ask: live.ask,
      spreadBps,
      quoteAgeSec: live.quoteAgeSec,
      volAccel: live.volAccel1m,
      haltCount: live.sessionHaltCount,
    },
  });

  return {
    ...model,
    builtAt: engine.computedAt,
    identity: {
      ...model.identity,
      price: avail(price),
      changePercent: avail(changePercent),
    },
    reaction: {
      ...model.reaction,
      currentPrice: engine.metrics.currentPrice,
      moveSincePublicationPct: engine.metrics.pctMoveSincePublication,
      moveSinceIngestPct: engine.metrics.pctMoveSinceIngestion,
      relativeVolume: engine.metrics.relativeVolume,
      volAccel1m: engine.metrics.volumeAcceleration,
      volAccel5m: avail(live.volAccel5m, { note: "requires_5m_bars" }),
      distanceFromVwapPct: engine.metrics.distanceFromVwapPct,
      distanceFromPremarketHighPct: engine.metrics.distanceFromPremarketHighPct,
      distanceFromSessionHighPct: engine.metrics.distanceFromHodPct,
    },
    tradeability: {
      ...model.tradeability,
      spreadDollars: avail(spreadDollars, { note: "requires_l1_quote" }),
      spreadBps: avail(spreadBps, { note: "requires_l1_quote" }),
      dollarVolume: avail(dollarVolume),
      bidSize: avail(live.bidSize, { note: "requires_licensed_l1" }),
      askSize: avail(live.askSize, { note: "requires_licensed_l1" }),
      floatShares: avail(floatShares, { estimated: true, note: "profile_heuristic" }),
      liquidity: classifyLiquidity({
        dollarVolume,
        spreadBps,
        rVol,
        floatShares,
      }),
      quoteFreshnessSec: avail(live.quoteAgeSec),
      sessionHaltCount:
        live.sessionHaltCount != null
          ? avail(live.sessionHaltCount)
          : model.tradeability.sessionHaltCount,
    },
    reactionStage: {
      stage: engine.stage,
      rules: engine.rules.map((r) => ({
        id: r.id,
        label: r.label,
        passed: r.passed,
        detail: r.detail,
      })),
      explanation: engine.explanation,
      conflictingEvidence: engine.conflictingEvidence,
      engineVersion: engine.engineVersion,
      timeline: engine.timeline,
      flappedSuppressed: engine.flappedSuppressed,
    },
    haltMonitor: model.haltMonitor,
  };
}
