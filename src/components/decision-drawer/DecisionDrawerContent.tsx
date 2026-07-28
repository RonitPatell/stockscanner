"use client";

/**
 * Decision Drawer — fixed section order presentation of Decision Card V3.
 * Sticky last-known tape/fields so rows don't flip empty between quote ticks.
 * Omits empty optional rows instead of painting "Unavailable."
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ExternalLink,
  LineChart,
} from "lucide-react";
import type { CatalystItem } from "@/types";
import {
  patchDecisionCardLive,
  projectDecisionCardV3,
  type DecisionCardV3Model,
} from "@/lib/decision-card";
import {
  confirmationLabel,
  drawerField,
  drawerLiquidityLabel,
  drawerReactionLabel,
  drawerText,
  drawerTime,
  sortPrimaryRisks,
  stickNumber,
} from "@/lib/decision-drawer";
import { cn, formatPrice, formatPercent, safeHttpUrl } from "@/lib/utils";
import {
  useLiveQuotesOptional,
  useRegisterLiveSymbols,
} from "../LiveQuoteProvider";
import { AnaloguePanel } from "../decision-card/AnaloguePanel";
import { DecisionFeedbackButtons } from "../trader-feedback/DecisionFeedbackButtons";

function Row({
  label,
  value,
  warn,
}: {
  label: string;
  value: string | null;
  warn?: boolean;
}) {
  if (value == null) return null;
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-[11px] leading-snug">
      <span className="shrink-0 text-[var(--text-muted)]">{label}</span>
      <span
        className={cn(
          "min-w-0 text-right font-mono tabular-nums font-medium",
          warn ? "text-red-300" : "text-[var(--text-primary)]"
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Section({
  title,
  children,
  guide,
}: {
  title: string;
  children: ReactNode;
  guide?: string;
}) {
  return (
    <section
      className="border-b border-[var(--border)] px-3 py-2.5 last:border-b-0"
      data-guide={guide}
      data-drawer-section={guide?.replace("decision-drawer-", "") ?? undefined}
    >
      <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
        {title}
      </h3>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

function PendingNote({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] leading-snug text-[var(--text-secondary)]">{children}</p>
  );
}

function stickModel(
  prev: DecisionCardV3Model | null,
  next: DecisionCardV3Model
): DecisionCardV3Model {
  if (!prev || prev.catalystId !== next.catalystId) return next;
  return {
    ...next,
    identity: {
      ...next.identity,
      price: stickNumber(prev.identity.price, next.identity.price),
      changePercent: stickNumber(
        prev.identity.changePercent,
        next.identity.changePercent
      ),
      companyName: next.identity.companyName ?? prev.identity.companyName,
    },
    reaction: {
      ...next.reaction,
      priceAtPublication: stickNumber(
        prev.reaction.priceAtPublication,
        next.reaction.priceAtPublication
      ),
      priceAtIngest: stickNumber(
        prev.reaction.priceAtIngest,
        next.reaction.priceAtIngest
      ),
      currentPrice: stickNumber(
        prev.reaction.currentPrice,
        next.reaction.currentPrice
      ),
      moveBeforePublicationPct: stickNumber(
        prev.reaction.moveBeforePublicationPct,
        next.reaction.moveBeforePublicationPct
      ),
      moveSincePublicationPct: stickNumber(
        prev.reaction.moveSincePublicationPct,
        next.reaction.moveSincePublicationPct
      ),
      moveSinceIngestPct: stickNumber(
        prev.reaction.moveSinceIngestPct,
        next.reaction.moveSinceIngestPct
      ),
      relativeVolume: stickNumber(
        prev.reaction.relativeVolume,
        next.reaction.relativeVolume
      ),
      volAccel1m: stickNumber(prev.reaction.volAccel1m, next.reaction.volAccel1m),
      volAccel5m: stickNumber(prev.reaction.volAccel5m, next.reaction.volAccel5m),
      distanceFromVwapPct: stickNumber(
        prev.reaction.distanceFromVwapPct,
        next.reaction.distanceFromVwapPct
      ),
      distanceFromPremarketHighPct: stickNumber(
        prev.reaction.distanceFromPremarketHighPct,
        next.reaction.distanceFromPremarketHighPct
      ),
      distanceFromSessionHighPct: stickNumber(
        prev.reaction.distanceFromSessionHighPct,
        next.reaction.distanceFromSessionHighPct
      ),
    },
    tradeability: {
      ...next.tradeability,
      spreadDollars: stickNumber(
        prev.tradeability.spreadDollars,
        next.tradeability.spreadDollars
      ),
      spreadBps: stickNumber(
        prev.tradeability.spreadBps,
        next.tradeability.spreadBps
      ),
      dollarVolume: stickNumber(
        prev.tradeability.dollarVolume,
        next.tradeability.dollarVolume
      ),
      bidSize: stickNumber(prev.tradeability.bidSize, next.tradeability.bidSize),
      askSize: stickNumber(prev.tradeability.askSize, next.tradeability.askSize),
      floatShares: stickNumber(
        prev.tradeability.floatShares,
        next.tradeability.floatShares
      ),
      quoteFreshnessSec: stickNumber(
        prev.tradeability.quoteFreshnessSec,
        next.tradeability.quoteFreshnessSec
      ),
      sessionHaltCount: stickNumber(
        prev.tradeability.sessionHaltCount,
        next.tradeability.sessionHaltCount
      ),
      liquidity:
        next.tradeability.liquidity !== "UNKNOWN" &&
        next.tradeability.liquidity !== "UNAVAILABLE"
          ? next.tradeability.liquidity
          : prev.tradeability.liquidity !== "UNKNOWN" &&
              prev.tradeability.liquidity !== "UNAVAILABLE"
            ? prev.tradeability.liquidity
            : next.tradeability.liquidity,
    },
  };
}

type DetailExtras = {
  summary?: string | null;
  keyPoints?: string[];
};

export function DecisionDrawerContent({
  catalyst,
  className,
  companyName,
  exchange,
  dilutionTypes,
  priceAtPublication,
  priceAtIngest,
}: {
  catalyst: CatalystItem;
  className?: string;
  companyName?: string | null;
  exchange?: string | null;
  dilutionTypes?: string[];
  priceAtPublication?: number | null;
  priceAtIngest?: number | null;
}) {
  useRegisterLiveSymbols(`drawer-${catalyst.id}`, [catalyst.symbol]);
  const liveQuotes = useLiveQuotesOptional();
  const stickyRef = useRef<{ id: string; model: DecisionCardV3Model | null }>({
    id: "",
    model: null,
  });

  const [detail, setDetail] = useState<DetailExtras | null>(null);
  const [optionalOpen, setOptionalOpen] = useState(false);

  useEffect(() => {
    stickyRef.current = { id: catalyst.id, model: null };
    setDetail(null);
    setOptionalOpen(false);
    let cancelled = false;
    const id = catalyst.id;
    if (!id) return;
    void (async () => {
      try {
        const res = await fetch(`/api/catalysts/${encodeURIComponent(id)}`, {
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          aiSummary?: string | null;
          keyPoints?: string[] | null;
        };
        if (cancelled) return;
        setDetail({
          summary: data.aiSummary ?? null,
          keyPoints: Array.isArray(data.keyPoints)
            ? data.keyPoints.filter(
                (k): k is string => typeof k === "string" && k.trim().length > 0
              )
            : [],
        });
      } catch {
        /* keep feed-level fields */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [catalyst.id]);

  const baseModel = useMemo(
    () =>
      projectDecisionCardV3(catalyst, {
        companyName: companyName ?? null,
        exchange: exchange ?? null,
        dilutionTypes,
        priceAtPublication: priceAtPublication ?? null,
        priceAtIngest: priceAtIngest ?? null,
        nowMs: Date.now(),
      }),
    [
      catalyst,
      companyName,
      exchange,
      dilutionTypes,
      priceAtPublication,
      priceAtIngest,
    ]
  );

  const liveModel = useMemo(() => {
    const q = liveQuotes[catalyst.symbol.toUpperCase()];
    if (!q) return baseModel;
    return patchDecisionCardLive(baseModel, {
      price: q.price,
      changePercent: q.changePercent,
      volume: q.volume,
      avgVolume: q.avgVolume,
      rVol: q.rVol,
      floatShares: q.floatShares,
      dayHigh: q.dayHigh,
    });
  }, [baseModel, liveQuotes, catalyst.symbol]);

  const model = useMemo(() => {
    const prev =
      stickyRef.current.id === catalyst.id ? stickyRef.current.model : null;
    const next = stickModel(prev, liveModel);
    stickyRef.current = { id: catalyst.id, model: next };
    return next;
  }, [liveModel, catalyst.id]);

  const risks = sortPrimaryRisks(model.risks);
  const confirm = confirmationLabel(model.catalyst.classificationConfidence);

  const evidenceBits = [
    drawerText(detail?.summary),
    drawerText(catalyst.aiSummary),
    drawerText(model.catalyst.factSummary),
    ...(detail?.keyPoints ?? []),
    ...(catalyst.keyPoints ?? []),
  ].filter((x, i, a): x is string => !!x && a.indexOf(x) === i);

  const headline = drawerText(catalyst.headline) ?? "—";
  const firstSeen =
    drawerTime(model.catalyst.firstSeenAt) ??
    drawerTime(catalyst.ingestedAt) ??
    drawerTime(catalyst.publishedAt);
  const published = drawerTime(model.catalyst.providerPublishedAt);

  const pubPrice = drawerField(model.reaction.priceAtPublication, {
    digits: 4,
    prefix: "$",
  });
  const ingestPrice = drawerField(model.reaction.priceAtIngest, {
    digits: 4,
    prefix: "$",
  });
  const curPrice = drawerField(model.reaction.currentPrice, {
    digits: 4,
    prefix: "$",
  });
  const move = drawerField(model.reaction.moveSincePublicationPct, {
    digits: 2,
    suffix: "%",
  });
  const moveIngest = drawerField(model.reaction.moveSinceIngestPct, {
    digits: 2,
    suffix: "%",
  });
  const rvol = drawerField(model.reaction.relativeVolume, {
    digits: 2,
    suffix: "x",
  });
  const dollarVol = drawerField(model.tradeability.dollarVolume, {
    compact: true,
    prefix: "$",
  });
  const spread$ = drawerField(model.tradeability.spreadDollars, {
    digits: 4,
    prefix: "$",
  });
  const spreadBps = drawerField(model.tradeability.spreadBps, {
    digits: 1,
    suffix: " bps",
  });
  const distHod = drawerField(model.reaction.distanceFromSessionHighPct, {
    digits: 1,
    suffix: "%",
  });
  const vwapRel = drawerField(model.reaction.distanceFromVwapPct, {
    digits: 2,
    suffix: "%",
  });
  const floatShares = drawerField(model.tradeability.floatShares, {
    compact: true,
  });
  const dayChange = drawerField(model.identity.changePercent, {
    digits: 2,
    suffix: "%",
  });

  const hasReactionMetrics = !!(
    pubPrice ||
    curPrice ||
    move ||
    rvol ||
    dollarVol ||
    distHod ||
    dayChange
  );

  const sourceUrl = safeHttpUrl(model.actions.sourceUrl);
  const liqLabel = drawerLiquidityLabel(model.tradeability.liquidity);
  const stageLabel = drawerReactionLabel(model.reactionStage.stage);

  const identityPrice =
    model.identity.price.value != null
      ? formatPrice(model.identity.price.value)
      : curPrice;
  const identityChange =
    model.identity.changePercent.value != null
      ? formatPercent(model.identity.changePercent.value)
      : dayChange;

  return (
    <div
      className={cn("flex h-full min-h-0 flex-col", className)}
      data-guide="decision-drawer"
      data-testid="decision-drawer-content"
    >
      <div className="shrink-0 border-b border-[var(--border)] px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-[15px] font-bold tracking-tight text-emerald-400">
                {model.identity.symbol}
              </span>
              {identityPrice && (
                <span className="font-mono text-[13px] tabular-nums text-[var(--text-primary)]">
                  {identityPrice}
                </span>
              )}
              {identityChange && (
                <span
                  className={cn(
                    "font-mono text-[12px] tabular-nums",
                    (model.identity.changePercent.value ?? 0) >= 0
                      ? "text-emerald-400"
                      : "text-red-400"
                  )}
                >
                  {identityChange}
                </span>
              )}
            </div>
            <p className="mt-1 line-clamp-3 text-[12px] font-medium leading-snug text-[var(--text-primary)]">
              {headline}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
              <span className="capitalize">
                {model.catalyst.sourceName || catalyst.source}
              </span>
              {model.catalyst.category && (
                <span className="rounded border border-[var(--border)] px-1 py-0.5 capitalize">
                  {model.catalyst.category.replace(/_/g, " ")}
                </span>
              )}
              {model.catalyst.subtype && (
                <span className="rounded border border-[var(--border)] px-1 py-0.5 capitalize">
                  {model.catalyst.subtype.replace(/_/g, " ")}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-1">
            <a
              href={model.actions.tradingViewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1 rounded border border-[var(--border)] px-2 py-1 text-[10px] font-semibold text-[var(--text-secondary)] hover:border-emerald-500/50 hover:text-emerald-300"
              title="TradingView (T)"
            >
              <LineChart className="h-3 w-3" aria-hidden />
              Chart
            </a>
            {sourceUrl && (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1 rounded border border-[var(--border)] px-2 py-1 text-[10px] font-semibold text-[var(--text-secondary)] hover:border-emerald-500/50 hover:text-emerald-300"
                title="Source (O)"
              >
                <ExternalLink className="h-3 w-3" aria-hidden />
                Source
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <Section title="1 · Event" guide="decision-drawer-event">
          <Row
            label="Company"
            value={drawerText(model.identity.companyName) ?? drawerText(companyName)}
          />
          <Row label="Source" value={drawerText(model.catalyst.sourceName)} />
          <Row
            label="Source class"
            value={
              model.catalyst.sourceClass !== "unknown"
                ? model.catalyst.sourceClass
                : null
            }
          />
          <Row
            label="Type"
            value={
              drawerText(model.catalyst.subtype)?.replace(/_/g, " ") ??
              drawerText(model.catalyst.category)?.replace(/_/g, " ") ??
              null
            }
          />
          <Row label="Published" value={published} />
          <Row label="First seen" value={firstSeen} />
          {!firstSeen && !published && (
            <PendingNote>Timestamps arrive with the feed item.</PendingNote>
          )}
        </Section>

        <Section title="2 · Reaction" guide="decision-drawer-reaction">
          <Row label="Stage" value={stageLabel} />
          <Row label="At publication" value={pubPrice} />
          <Row label="At ingest" value={ingestPrice} />
          <Row label="Current" value={curPrice} />
          <Row label="Move since pub" value={move} />
          <Row label="Move since ingest" value={moveIngest} />
          <Row label="Session change" value={dayChange} />
          <Row label="RVol" value={rvol} />
          <Row label="Dollar volume" value={dollarVol} />
          <Row label="Vs session high" value={distHod} />
          <Row label="Vs VWAP" value={vwapRel} />
          {model.reactionStage.explanation && (
            <p className="mt-1.5 text-[10px] leading-snug text-[var(--text-secondary)]">
              {model.reactionStage.explanation}
            </p>
          )}
          {!hasReactionMetrics && (
            <PendingNote>
              Tape syncing for {model.identity.symbol} — price and volume fill as
              quotes arrive and stay once seen.
            </PendingNote>
          )}
        </Section>

        <Section title="3 · Tradeability" guide="decision-drawer-tradeability">
          <Row
            label="Liquidity"
            value={
              liqLabel &&
              !/unknown|unavailable/i.test(liqLabel)
                ? liqLabel
                : dollarVol
                  ? "From dollar volume"
                  : null
            }
          />
          <Row label="Spread" value={spread$ ?? spreadBps} />
          <Row label="Spread (bps)" value={spread$ ? spreadBps : null} />
          <Row label="Float" value={floatShares} />
          <Row label="Confirmation" value={confirm} />
          {model.tradeability.tradeabilityExplanation && (
            <p className="mt-1 text-[10px] leading-snug text-[var(--text-secondary)]">
              {model.tradeability.tradeabilityExplanation}
            </p>
          )}
          {(model.tradeability.tradeabilityWarnings?.length ?? 0) > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {model.tradeability.tradeabilityWarnings!.map((w) => (
                <span
                  key={w}
                  className="rounded border border-amber-500/35 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-amber-200/90"
                >
                  {w.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          )}
        </Section>

        <Section title="4 · Primary risks" guide="decision-drawer-risks">
          {risks.length === 0 ? (
            <PendingNote>No active primary risk flags on this item.</PendingNote>
          ) : (
            <div className="flex flex-wrap gap-1">
              {risks.map((r) => (
                <span
                  key={r.id}
                  className={cn(
                    "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-wide",
                    r.severity === "high"
                      ? "border-red-500/40 text-red-300"
                      : r.severity === "medium"
                        ? "border-amber-500/35 text-amber-200"
                        : "border-[var(--border)] text-[var(--text-muted)]"
                  )}
                >
                  <AlertTriangle className="h-2.5 w-2.5" aria-hidden />
                  {r.label}
                </span>
              ))}
            </div>
          )}
          {risks.slice(0, 3).map((r) =>
            r.detail ? (
              <p
                key={`${r.id}-detail`}
                className="mt-1 text-[10px] leading-snug text-[var(--text-secondary)]"
              >
                <span className="text-[var(--text-primary)]">{r.label}</span>
                {" — "}
                {r.detail}
              </p>
            ) : null
          )}
        </Section>

        <Section title="5 · Evidence" guide="decision-drawer-evidence">
          {evidenceBits.length === 0 ? (
            <p className="text-[11px] leading-snug text-[var(--text-primary)]">
              {headline}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {evidenceBits.slice(0, 6).map((bit, i) => (
                <li
                  key={i}
                  className="text-[11px] leading-snug text-[var(--text-secondary)]"
                >
                  {bit}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <section
          className="px-3 py-2.5"
          data-guide="decision-drawer-optional"
          data-drawer-section="optional-analysis"
        >
          <button
            type="button"
            onClick={() => setOptionalOpen((v) => !v)}
            className="mb-1.5 flex w-full items-center justify-between text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            aria-expanded={optionalOpen}
          >
            <span>6 · Optional analysis</span>
            <span className="font-mono normal-case tracking-normal">
              {optionalOpen ? "Hide" : "Show"}
            </span>
          </button>
          {optionalOpen && (
            <div className="space-y-3">
              <div>
                <div className="mb-1.5 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  Your decision (local)
                </div>
                <DecisionFeedbackButtons
                  catalyst={catalyst}
                  reactionStage={model.reactionStage?.stage ?? null}
                  tradeability={model.tradeability?.liquidity ?? null}
                  risks={risks.map((r) => r.label)}
                />
              </div>
              <div>
                <div className="mb-1.5 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  Historical analogues
                </div>
                <AnaloguePanel catalystId={catalyst.id} />
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
