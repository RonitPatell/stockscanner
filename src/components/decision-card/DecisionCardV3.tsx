"use client";

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  ChevronDown,
  ExternalLink,
  LineChart,
  Star,
  VolumeX,
  AlertTriangle,
} from "lucide-react";
import type { CatalystItem } from "@/types";
import { cn, formatPercent, formatPrice, safeHttpUrl } from "@/lib/utils";
import {
  projectDecisionCardV3,
  patchDecisionCardLive,
  formatAvail,
  type CardDensity,
  type DecisionCardV3Model,
  type AvailableNumber,
} from "@/lib/decision-card";
import { ReactionStageTimeline } from "./ReactionStageTimeline";
import { HaltMonitorCard } from "./HaltMonitorCard";
import { AnaloguePanel } from "./AnaloguePanel";
import { DecisionFeedbackButtons } from "../trader-feedback/DecisionFeedbackButtons";
import {
  pickLiveField,
  useLiveQuotesOptional,
  useRegisterLiveSymbols,
} from "../LiveQuoteProvider";

function Field({
  label,
  field,
  digits = 2,
  suffix = "",
  className,
}: {
  label: string;
  field: AvailableNumber;
  digits?: number;
  suffix?: string;
  className?: string;
}) {
  const unavailable = field.availability === "unavailable" || field.value == null;
  if (unavailable) return null;
  const note =
    field.availability === "estimated"
      ? " (est.)"
      : field.availability === "stale"
        ? " (stale)"
        : "";
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-[9px] uppercase tracking-wider text-[--text-muted] truncate">
        {label}
      </div>
      <div
        className="font-mono text-[11px] tabular-nums truncate text-[--text-primary]"
        title={field.note}
      >
        {formatAvail(field, { digits, suffix })}
        {note}
      </div>
    </div>
  );
}

/** Isolated live price/% — avoids rebuilding the whole card model on every tick. */
const LiveIdentityTape = memo(function LiveIdentityTape({
  symbol,
  fallbackPrice,
  fallbackChange,
}: {
  symbol: string;
  fallbackPrice: number | null;
  fallbackChange: number | null;
}) {
  const quotes = useLiveQuotesOptional();
  const price = pickLiveField(symbol, quotes, "price", fallbackPrice);
  const change = pickLiveField(symbol, quotes, "changePercent", fallbackChange);
  return (
    <div className="flex items-baseline gap-2 font-mono tabular-nums shrink-0">
      <span className="text-[13px] text-[--text-primary]">
        {price != null ? formatPrice(price) : "—"}
      </span>
      <span
        className={cn(
          "text-[12px]",
          change == null
            ? "text-[--text-muted]"
            : change >= 0
              ? "text-emerald-400"
              : "text-red-400"
        )}
      >
        {change == null ? "—" : formatPercent(change)}
      </span>
    </div>
  );
});

export interface DecisionCardV3Props {
  catalyst: CatalystItem;
  density?: CardDensity;
  highlighted?: boolean;
  forceExpanded?: boolean;
  inWatchlist?: boolean;
  muted?: boolean;
  onWatchlistToggle?: (symbol: string) => void;
  onMuteToggle?: (symbol: string) => void;
  companyName?: string | null;
  exchange?: string | null;
  dilutionTypes?: string[];
  priceAtPublication?: number | null;
  priceAtIngest?: number | null;
  nowMs?: number;
  className?: string;
}

export function DecisionCardV3({
  catalyst,
  density = "standard",
  highlighted = false,
  forceExpanded,
  inWatchlist = false,
  muted = false,
  onWatchlistToggle,
  onMuteToggle,
  companyName = null,
  exchange = null,
  dilutionTypes,
  priceAtPublication = null,
  priceAtIngest = null,
  nowMs,
  className,
}: DecisionCardV3Props) {
  const reactId = useId();
  useRegisterLiveSymbols(`dc3-${catalyst.id}`, [catalyst.symbol]);
  const liveQuotes = useLiveQuotesOptional();

  const baseModel = useMemo(() => {
    const t0 =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const model = projectDecisionCardV3(catalyst, {
      companyName,
      exchange,
      dilutionTypes,
      priceAtPublication,
      priceAtIngest,
      nowMs: nowMs ?? Date.now(),
    });
    if (typeof performance !== "undefined" && process.env.NODE_ENV === "development") {
      const dt = performance.now() - t0;
      if (dt > 100) {
        console.warn(`[DecisionCardV3] project ${dt.toFixed(1)}ms for ${catalyst.symbol}`);
      }
    }
    return model;
  }, [
    catalyst,
    companyName,
    exchange,
    dilutionTypes,
    priceAtPublication,
    priceAtIngest,
    nowMs,
  ]);

  const model: DecisionCardV3Model = useMemo(() => {
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

  const [expanded, setExpanded] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [riskOpen, setRiskOpen] = useState(false);
  const [stageOpen, setStageOpen] = useState(false);
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (forceExpanded === undefined) return;
    setExpanded(forceExpanded);
  }, [forceExpanded, catalyst.id]);

  const openSource = useCallback(() => {
    const url = safeHttpUrl(model.actions.sourceUrl);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }, [model.actions.sourceUrl]);

  const openTv = useCallback(() => {
    window.open(model.actions.tradingViewUrl, "_blank", "noopener,noreferrer");
  }, [model.actions.tradingViewUrl]);

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (e.target !== rootRef.current && (e.target as HTMLElement).closest("button,a,details,summary")) {
        // allow nested controls; still handle card-level hotkeys when focused
      }
      const key = e.key.toLowerCase();
      if (key === "o") {
        e.preventDefault();
        openSource();
      } else if (key === "t") {
        e.preventDefault();
        openTv();
      } else if (key === "w" && onWatchlistToggle) {
        e.preventDefault();
        onWatchlistToggle(catalyst.symbol);
      } else if (key === "u" && onMuteToggle) {
        e.preventDefault();
        onMuteToggle(catalyst.symbol);
      } else if (key === "enter" || key === " ") {
        if (e.target === rootRef.current) {
          e.preventDefault();
          setExpanded((v) => !v);
        }
      }
    },
    [openSource, openTv, onWatchlistToggle, onMuteToggle, catalyst.symbol]
  );

  const activeRisks = model.risks.filter((r) => r.active);
  const compact = density === "compact";
  const detailed = density === "detailed";

  return (
    <article
      ref={rootRef}
      tabIndex={0}
      role="article"
      aria-label={`Decision card ${model.identity.symbol}`}
      data-decision-card-v3
      data-density={density}
      data-symbol={model.identity.symbol}
      onKeyDown={onKeyDown}
      className={cn(
        "border-b border-[--border] outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-inset",
        highlighted && "bg-emerald-500/[0.06]",
        muted && "opacity-50",
        className
      )}
      style={{ contentVisibility: "auto", containIntrinsicSize: compact ? "72px" : "120px" }}
    >
      {/* 1 · Identity */}
      <div
        className={cn(
          "grid items-center gap-2 px-3 sm:px-4",
          compact
            ? "grid-cols-[72px_1fr_auto] py-2"
            : "grid-cols-[88px_1fr_auto] sm:grid-cols-[100px_1fr_auto_auto] py-2.5"
        )}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-bold text-[13px] text-[--text-primary]">
              {model.identity.symbol}
            </span>
            {model.identity.halted && (
              <span className="text-[9px] font-bold uppercase text-amber-300 border border-amber-500/40 px-1 rounded">
                Halt?
              </span>
            )}
          </div>
          {!compact && (
            <div className="text-[10px] text-[--text-muted] truncate">
              {model.identity.companyName || model.identity.symbol}
              {model.identity.exchange ? ` · ${model.identity.exchange}` : ""}
            </div>
          )}
        </div>

        <div className="min-w-0">
          <p className="text-[12px] sm:text-[13px] text-[--text-secondary] truncate">
            {model.catalyst.factSummary}
          </p>
          {!compact && (
            <div className="flex flex-wrap gap-2 mt-0.5 text-[10px] text-[--text-muted]">
              <span className="uppercase tracking-wide">{model.catalyst.category}</span>
              {model.catalyst.subtype && <span>· {model.catalyst.subtype}</span>}
              <span>· {model.identity.marketSession}</span>
              <span
                className={cn(
                  "font-mono",
                  model.reactionStage.stage === "EARLY" && "text-emerald-400",
                  model.reactionStage.stage === "EXTENDED" && "text-amber-400",
                  model.reactionStage.stage === "STALE" && "text-[--text-muted]",
                  model.reactionStage.stage === "UNKNOWN" && "text-rose-300"
                )}
              >
                ·{" "}
                {model.reactionStage.stage === "EARLY"
                  ? "Early"
                  : model.reactionStage.stage === "ACTIVE"
                    ? "Active"
                    : model.reactionStage.stage === "EXTENDED"
                      ? "Extended"
                      : model.reactionStage.stage === "STALE"
                        ? "Stale"
                        : "Unknown"}
              </span>
            </div>
          )}
        </div>

        <LiveIdentityTape
          symbol={model.identity.symbol}
          fallbackPrice={model.identity.price.value}
          fallbackChange={model.identity.changePercent.value}
        />

        <div className="hidden sm:flex items-center gap-1">
          <button
            type="button"
            aria-label={inWatchlist ? "Remove from watchlist" : "Add to watchlist"}
            title="Watchlist (W)"
            onClick={() => onWatchlistToggle?.(catalyst.symbol)}
            className={cn(
              "p-1.5 rounded border border-transparent hover:border-[--border] focus-visible:ring-2 focus-visible:ring-emerald-500/50",
              inWatchlist && "text-amber-300"
            )}
          >
            <Star className="w-3.5 h-3.5" fill={inWatchlist ? "currentColor" : "none"} />
          </button>
          <button
            type="button"
            aria-label="Open TradingView"
            title="TradingView (T)"
            onClick={openTv}
            className="p-1.5 rounded hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-emerald-500/50"
          >
            <LineChart className="w-3.5 h-3.5 text-[--text-secondary]" />
          </button>
          <button
            type="button"
            aria-label="Open source"
            title="Source (O)"
            onClick={openSource}
            disabled={!safeHttpUrl(model.actions.sourceUrl)}
            className="p-1.5 rounded hover:bg-white/[0.04] disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-emerald-500/50"
          >
            <ExternalLink className="w-3.5 h-3.5 text-[--text-secondary]" />
          </button>
          <button
            type="button"
            aria-label={muted ? "Unmute ticker" : "Mute ticker"}
            title="Mute (U)"
            onClick={() => onMuteToggle?.(catalyst.symbol)}
            className="p-1.5 rounded hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-emerald-500/50"
          >
            <VolumeX className="w-3.5 h-3.5 text-[--text-secondary]" />
          </button>
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={`${reactId}-body`}
            onClick={() => setExpanded((v) => !v)}
            className="p-1.5 rounded hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-emerald-500/50"
          >
            <ChevronDown
              className={cn(
                "w-3.5 h-3.5 text-[--text-muted] transition-transform",
                expanded && "rotate-180"
              )}
            />
          </button>
        </div>
      </div>

      {/* Active risk chips (standard+) */}
      {!compact && activeRisks.length > 0 && (
        <div className="px-3 sm:px-4 pb-2 flex flex-wrap gap-1.5">
          {activeRisks.slice(0, detailed ? 12 : 5).map((r) => (
            <span
              key={r.id}
              className={cn(
                "inline-flex items-center gap-1 text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded border",
                r.severity === "high"
                  ? "border-red-500/40 text-red-300"
                  : r.severity === "medium"
                    ? "border-amber-500/35 text-amber-200"
                    : "border-[--border] text-[--text-muted]"
              )}
            >
              <AlertTriangle className="w-2.5 h-2.5" aria-hidden />
              {r.label}
            </span>
          ))}
        </div>
      )}

      {model.haltMonitor && (model.haltMonitor.active || (model.haltMonitor.sessionHaltCount ?? 0) > 0) && (
        <div className="px-3 sm:px-4 pb-2">
          <HaltMonitorCard
            symbol={model.identity.symbol}
            active={model.haltMonitor.active}
            haltCode={model.haltMonitor.haltCode}
            haltCodeTitle={model.haltMonitor.haltCodeTitle}
            lifecycle={model.haltMonitor.lifecycle}
            resumptionQuoteLabel={model.haltMonitor.resumptionQuoteLabel}
            resumptionTradeLabel={model.haltMonitor.resumptionTradeLabel}
            sessionHaltCount={model.haltMonitor.sessionHaltCount}
            newsDisseminationStatus={model.haltMonitor.newsDisseminationStatus}
            reconciliationStatus={model.haltMonitor.reconciliationStatus}
            catalystCount={model.haltMonitor.catalystCount}
            disclaimer={model.haltMonitor.disclaimer}
          />
        </div>
      )}

      {/* Expanded strips */}
      {expanded && (
        <div id={`${reactId}-body`} className="px-3 sm:px-4 pb-3 space-y-3 border-t border-[--border]/30">
          {/* 2 · Catalyst */}
          <section aria-label="Catalyst">
            <h4 className="mk-tick mb-2 !text-emerald-400/80">Catalyst</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <div className="text-[9px] uppercase tracking-wider text-[--text-muted]">Source class</div>
                <div className="font-mono text-[11px]">{model.catalyst.sourceClass}</div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wider text-[--text-muted]">Published</div>
                <div className="font-mono text-[11px]">
                  {model.catalyst.providerPublishedAt
                    ? new Date(model.catalyst.providerPublishedAt).toLocaleTimeString()
                    : "—"}
                </div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wider text-[--text-muted]">First seen</div>
                <div className="font-mono text-[11px]">
                  {model.catalyst.firstSeenAt
                    ? new Date(model.catalyst.firstSeenAt).toLocaleTimeString()
                    : "—"}
                </div>
              </div>
              <Field
                label="Age (sec)"
                field={
                  model.catalyst.ageSec != null
                    ? { value: model.catalyst.ageSec, availability: "ok" }
                    : { value: null, availability: "unavailable" }
                }
                digits={0}
              />
              <div>
                <div className="text-[9px] uppercase tracking-wider text-[--text-muted]">
                  Timestamp quality
                </div>
                <div className="font-mono text-[11px]">{model.catalyst.timestampQuality}</div>
              </div>
              <Field label="Confidence" field={model.catalyst.classificationConfidence} digits={0} />
              <Field label="Confirming sources" field={model.catalyst.confirmingSourceCount} digits={0} />
            </div>
          </section>

          {/* 3 · Reaction */}
          <section aria-label="Reaction">
            <h4 className="mk-tick mb-2 !text-emerald-400/80">Reaction</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Field label="Px @ publish" field={model.reaction.priceAtPublication} />
              <Field label="Px @ ingest" field={model.reaction.priceAtIngest} />
              <Field label="Current px" field={model.reaction.currentPrice} />
              <Field label="Δ before publish" field={model.reaction.moveBeforePublicationPct} suffix="%" />
              <Field label="Δ since publish" field={model.reaction.moveSincePublicationPct} suffix="%" />
              <Field label="Δ since ingest" field={model.reaction.moveSinceIngestPct} suffix="%" />
              <Field label="RVol" field={model.reaction.relativeVolume} digits={1} suffix="x" />
              <Field label="Vol accel 1m" field={model.reaction.volAccel1m} />
              <Field label="Vol accel 5m" field={model.reaction.volAccel5m} />
              <Field label="vs VWAP" field={model.reaction.distanceFromVwapPct} suffix="%" />
              <Field label="vs PM high" field={model.reaction.distanceFromPremarketHighPct} suffix="%" />
              <Field label="vs session high" field={model.reaction.distanceFromSessionHighPct} suffix="%" />
            </div>
          </section>

          {/* 4 · Tradeability */}
          <section aria-label="Tradeability">
            <h4 className="mk-tick mb-2 !text-emerald-400/80">Tradeability</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Field label="Spread $" field={model.tradeability.spreadDollars} digits={4} />
              <Field label="Spread bps" field={model.tradeability.spreadBps} digits={1} />
              <Field label="Dollar volume" field={model.tradeability.dollarVolume} digits={0} />
              <Field label="Bid size" field={model.tradeability.bidSize} digits={0} />
              <Field label="Ask size" field={model.tradeability.askSize} digits={0} />
              <Field label="Float" field={model.tradeability.floatShares} digits={0} />
              <div>
                <div className="text-[9px] uppercase tracking-wider text-[--text-muted]">
                  Float confidence
                </div>
                <div className="font-mono text-[11px]">{model.tradeability.floatConfidence}</div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wider text-[--text-muted]">Liquidity</div>
                <div className="font-mono text-[11px]">
                  {model.tradeability.liquidity === "LIQUID"
                    ? "Liquid"
                    : model.tradeability.liquidity === "ACCEPTABLE"
                      ? "Acceptable"
                      : model.tradeability.liquidity === "THIN"
                        ? "Thin"
                        : model.tradeability.liquidity === "EXTREMELY_THIN"
                          ? "Extremely thin"
                          : "Unknown"}
                </div>
              </div>
              <Field label="Quote age (sec)" field={model.tradeability.quoteFreshnessSec} digits={0} />
              <Field label="Session halts" field={model.tradeability.sessionHaltCount} digits={0} />
            </div>
            {model.tradeability.tradeabilityExplanation && (
              <p className="mt-2 text-[10px] leading-relaxed text-[--text-secondary]">
                {model.tradeability.tradeabilityExplanation}
              </p>
            )}
            {(model.tradeability.tradeabilityWarnings?.length ?? 0) > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {model.tradeability.tradeabilityWarnings!.map((w) => (
                  <span
                    key={w}
                    className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-amber-500/35 text-amber-200/90"
                  >
                    {w.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            )}
            {(model.tradeability.missingTradeabilityInputs?.length ?? 0) > 0 && (
              <p className="mt-1 text-[9px] text-[--text-muted]">
                Missing: {model.tradeability.missingTradeabilityInputs!.join(", ")}
              </p>
            )}
            {model.tradeability.illustrativeSlippageNote && (
              <p className="mt-1 text-[9px] italic text-[--text-muted]">
                {model.tradeability.illustrativeSlippageNote}
              </p>
            )}
          </section>

          {/* 5 · Risks drawer */}
          <details
            open={riskOpen}
            onToggle={(e) => setRiskOpen((e.target as HTMLDetailsElement).open)}
            className="rounded border border-[--border] bg-black/20"
          >
            <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold text-amber-200/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50">
              Risk strip ({activeRisks.length} active)
            </summary>
            <ul className="px-3 pb-3 space-y-1.5">
              {(detailed ? model.risks : model.risks.filter((r) => r.active)).map((r) => (
                <li
                  key={r.id}
                  className={cn(
                    "text-[11px] flex gap-2",
                    r.active ? "text-[--text-secondary]" : "text-[--text-muted]"
                  )}
                >
                  <span className="font-mono uppercase w-16 shrink-0">
                    {r.active ? "ON" : "off"}
                  </span>
                  <span>
                    <strong className="text-[--text-primary]">{r.label}</strong> — {r.detail}
                  </span>
                </li>
              ))}
            </ul>
          </details>

          {/* 6 · Reaction stage rules */}
          <details
            open={stageOpen}
            onToggle={(e) => setStageOpen((e.target as HTMLDetailsElement).open)}
            className="rounded border border-[--border] bg-black/20"
          >
            <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50">
              Reaction stage: {model.reactionStage.stage}
              {model.reactionStage.engineVersion
                ? ` · ${model.reactionStage.engineVersion}`
                : ""}
            </summary>
            <div className="px-3 pb-3 space-y-3">
              <p className="text-[11px] text-[--text-secondary] leading-relaxed">
                {model.reactionStage.explanation}
              </p>
              {(model.reactionStage.conflictingEvidence?.length ?? 0) > 0 && (
                <div className="rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1.5">
                  <div className="text-[10px] uppercase tracking-wide text-amber-200/90 mb-1">
                    Conflicting evidence
                  </div>
                  <ul className="space-y-1">
                    {model.reactionStage.conflictingEvidence!.map((c) => (
                      <li key={c.id} className="text-[11px] text-amber-100/90">
                        <strong>{c.label}</strong> — {c.detail}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {model.reactionStage.timeline && (
                <ReactionStageTimeline events={model.reactionStage.timeline} />
              )}
              <ul className="space-y-1.5">
                {model.reactionStage.rules.map((rule) => (
                  <li key={rule.id} className="text-[11px] text-[--text-secondary]">
                    <span
                      className={cn(
                        "font-mono mr-2",
                        rule.passed ? "text-emerald-400" : "text-[--text-muted]"
                      )}
                    >
                      {rule.passed ? "PASS" : "—"}
                    </span>
                    {rule.label}: {rule.detail}
                  </li>
                ))}
              </ul>
            </div>
          </details>

          {/* Trader feedback — local by default */}
          <div className="rounded border border-[--border] bg-black/20 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-[--text-muted] mb-1.5">
              Your decision (local)
            </div>
            <DecisionFeedbackButtons
              catalyst={catalyst}
              reactionStage={model.reactionStage?.stage ?? null}
              tradeability={model.tradeability?.liquidity ?? null}
              risks={(model.risks ?? [])
                .filter((r) => r.active)
                .map((r) => r.label)}
            />
          </div>

          {/* Historical analogues */}
          <details className="rounded border border-[--border] bg-black/20">
            <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50">
              Historical analogues (descriptive)
            </summary>
            <div className="px-3 pb-3">
              <AnaloguePanel catalystId={catalyst.id} />
            </div>
          </details>

          {/* Evidence */}
          <details
            open={evidenceOpen}
            onToggle={(e) => setEvidenceOpen((e.target as HTMLDetailsElement).open)}
            className="rounded border border-[--border] bg-black/20"
          >
            <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50">
              Evidence
            </summary>
            <div className="px-3 pb-3 text-[11px] text-[--text-secondary] space-y-1">
              <p>{model.catalyst.factSummary}</p>
              <p>
                Source: {model.catalyst.sourceName} ({model.catalyst.sourceClass})
              </p>
              {safeHttpUrl(model.actions.sourceUrl) && (
                <a
                  href={safeHttpUrl(model.actions.sourceUrl)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-400 hover:underline"
                >
                  Open primary source →
                </a>
              )}
            </div>
          </details>

          <p className="text-[9px] text-[--text-muted]">{model.disclaimer}</p>
          <p className="text-[9px] text-[--text-muted] font-mono">
            Hotkeys: O source · T TradingView · W watchlist · U mute · Enter expand
          </p>
        </div>
      )}
    </article>
  );
}
