"use client";

import {
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { safeHttpUrl } from "@/lib/utils";
import { LiveMarketValue } from "../motion/LiveMarketValue.tsx";
import {
  formatMonitorNumber,
  formatMonitorText,
} from "./selected-ticker-format.ts";
import type { MonitorSelectedTicker } from "./selected-ticker-types.ts";
import {
  DeferredAnaloguesSection,
  DeferredFilingEvidence,
  DeferredPersonalSection,
} from "../progressive/DeferredSupplemental.tsx";
import { MonitorLoadBoundary } from "../progressive/MonitorLoadBoundary.ts";
import { IntelPanelSkeleton } from "../progressive/skeletons.ts";

function Row({
  label,
  value,
  warn,
  risk,
  accent,
  testId,
  hint,
  criticalOnceKey,
}: {
  label: string;
  value: string;
  warn?: boolean;
  risk?: boolean;
  accent?: boolean;
  testId?: string;
  hint?: string;
  criticalOnceKey?: string | null;
}) {
  return (
    <div className="tt-intel__row" title={hint}>
      <span className="tt-intel__label">{label}</span>
      <LiveMarketValue
        className="tt-intel__value"
        value={value}
        warn={warn}
        risk={risk}
        accent={accent}
        testId={testId}
        criticalOnceKey={criticalOnceKey}
      />
    </div>
  );
}

function Section({
  id,
  title,
  blurb,
  accent,
  children,
}: {
  id: string;
  title: string;
  blurb?: string;
  accent?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className="tt-intel__section"
      data-intel-section={id}
      data-accent={accent ? "true" : "false"}
      aria-labelledby={`intel-${id}`}
    >
      <header className="tt-intel__section-h">
        <h3 id={`intel-${id}`}>{title}</h3>
        {blurb ? <p className="tt-intel__blurb">{blurb}</p> : null}
      </header>
      <div className="tt-intel__section-body">{children}</div>
    </section>
  );
}

function ageLabel(atMs: number | null | undefined, unavailable?: boolean): string {
  if (unavailable || atMs == null) return "Unavailable";
  const ms = Date.now() - atMs;
  if (ms < 1000) return "<1s ago";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  return `${Math.round(ms / 60_000)}m ago`;
}

function quoteFreshnessLabel(dossier: MonitorSelectedTicker): string {
  const conf = formatMonitorText(dossier.currentState.dataConfidence);
  if (conf !== "Unavailable") return conf;
  return "Unavailable";
}

export interface SelectedTickerPanelProps {
  dossier: MonitorSelectedTicker | null;
  onPinToggle?: (symbol: string) => void;
  compact?: boolean;
  /** Loading skeleton that mirrors the instrument layout. */
  loading?: boolean;
  onClose?: () => void;
}

/**
 * Selected-ticker intelligence — analytical instrument layout.
 * Sticky header + five primary sections; secondary blocks stay collapsed
 * across live updates for the same symbol.
 */
export function SelectedTickerPanel({
  dossier,
  onPinToggle,
  compact = false,
  loading = false,
  onClose,
}: SelectedTickerPanelProps) {
  const [openSecondary, setOpenSecondary] = useState<Record<string, boolean>>(
    {}
  );

  // Reset expanded secondary only when the focused ticker changes — never on live ticks.
  useEffect(() => {
    setOpenSecondary({});
  }, [dossier?.symbol]);

  const toggleSecondary = (id: string) => {
    setOpenSecondary((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Never skeleton over a valid dossier — only when this panel has no data yet.
  if (loading && !dossier) {
    return (
      <div
        className="tt-monitor__intel tt-intel"
        data-testid="monitor-selected-ticker"
        data-loading="true"
      >
        <IntelPanelSkeleton reason="awaiting-panel" />
      </div>
    );
  }

  if (!dossier) {
    return (
      <div
        className="tt-monitor__intel tt-intel"
        data-testid="monitor-selected-ticker"
      >
        <p className="tt-intel__empty">Select a symbol to inspect.</p>
      </div>
    );
  }

  const { identity, currentState, verifiedCatalyst, marketMovement } = dossier;
  const sourceUrl = safeHttpUrl(
    dossier.actions.sourceUrl ?? verifiedCatalyst.sourceUrl ?? null
  );
  const evidenceUrl = safeHttpUrl(dossier.evidence.primarySourceUrl);

  const stateLabel = formatMonitorText(currentState.momentumState);
  const sessionMove = formatMonitorNumber(identity.sessionChangePct, {
    digits: 2,
    suffix: "%",
  });
  const price = formatMonitorNumber(identity.price, {
    digits: 4,
    prefix: "$",
  });
  const tradeWarn = /thin|spread|deteriorat/i.test(
    currentState.tradeability.value ?? ""
  );
  const haltActive = dossier.primaryRisks.some(
    (r) => r.kind === "halt" && r.status === "active"
  );
  const headerAccent = haltActive
    ? "halt"
    : tradeWarn
      ? "trade"
      : verifiedCatalyst.present
        ? "catalyst"
        : "none";

  const latestTimeline = dossier.eventTimeline[0] ?? null;
  const activeRisks = dossier.primaryRisks.filter((r) => r.status === "active");
  const dilutionKinds = new Set([
    "dilution",
    "offering",
    "atm",
    "warrants",
    "reverse_split",
  ]);
  const dilutionActive = activeRisks.filter((r) => dilutionKinds.has(r.kind));
  const dilutionSummary =
    dilutionActive.length > 0
      ? dilutionActive
          .map((r) => r.detail ?? r.label)
          .join(" · ")
      : dossier.primaryRisks
            .filter((r) => dilutionKinds.has(r.kind))
            .every((r) => r.status === "clear")
        ? "Clear"
        : "Unavailable";

  return (
    <div
      key={dossier.symbol}
      className="tt-monitor__intel tt-intel"
      data-testid="monitor-selected-ticker"
      data-symbol={dossier.symbol}
      data-compact={compact ? "true" : "false"}
      data-accent={headerAccent}
    >
      <header className="tt-intel__sticky" data-intel-section="identity">
        <div className="tt-intel__sticky-top">
          <div className="tt-intel__sticky-id">
            <div className="tt-intel__ticker">{identity.ticker}</div>
            <div className="tt-intel__company">
              {formatMonitorText(identity.company)}
            </div>
          </div>
          <div className="tt-intel__sticky-actions">
            {onClose ? (
              <button
                type="button"
                className="tt-monitor__drawer-btn tt-monitor__tablet-only"
                onClick={onClose}
              >
                Close
              </button>
            ) : null}
            {onPinToggle ? (
              <button
                type="button"
                className="tt-intel__pin tt-mon-press"
                aria-pressed={identity.pinned}
                onClick={() => onPinToggle(identity.ticker)}
                data-testid="monitor-intel-pin"
                data-pin={identity.pinned ? "on" : "off"}
              >
                {identity.pinned ? "Pinned" : "Pin"}
              </button>
            ) : null}
          </div>
        </div>

        <div className="tt-intel__sticky-metrics">
          <div className="tt-intel__metric">
            <span className="tt-intel__metric-label">Price</span>
            <LiveMarketValue
              className="tt-intel__value"
              value={price}
              accent={headerAccent === "none"}
            />
          </div>
          <div className="tt-intel__metric">
            <span className="tt-intel__metric-label">Session</span>
            <LiveMarketValue
              className="tt-intel__value"
              value={sessionMove}
            />
          </div>
          <div className="tt-intel__metric">
            <span className="tt-intel__metric-label">State</span>
            <LiveMarketValue
              className="tt-intel__value"
              value={stateLabel}
              testId="monitor-intel-momentum-state"
              accent={haltActive || /BREAKING|HALTED/i.test(stateLabel)}
              risk={haltActive}
              criticalOnceKey={
                haltActive ? `halt-${dossier.symbol}` : null
              }
            />
          </div>
        </div>

        <div className="tt-intel__sticky-links">
          {sourceUrl ? (
            <a
              className="tt-intel__link"
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="monitor-intel-source"
            >
              Source
            </a>
          ) : (
            <span className="tt-intel__link tt-intel__link--muted">Source unavailable</span>
          )}
          <a
            className="tt-intel__link"
            href={dossier.actions.tradingViewUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="monitor-intel-tradingview"
          >
            TradingView
          </a>
        </div>
      </header>

      <div className="tt-intel__body">
        <Section
          id="what-happened"
          title="1 · What happened"
          blurb="Verified catalyst fact and timing — not a trade cue."
        >
          {/* Alias for Event Tape deep-links */}
          <span data-intel-section="verified-catalyst" className="sr-only" />
          {!verifiedCatalyst.present &&
          verifiedCatalyst.oneSentenceFact.availability === "unavailable" ? (
            <p className="tt-intel__note">No verified catalyst for this symbol.</p>
          ) : null}
          <Row
            label="Fact"
            value={formatMonitorText(verifiedCatalyst.oneSentenceFact)}
            accent={verifiedCatalyst.present}
          />
          <Row
            label="Source"
            value={formatMonitorText(verifiedCatalyst.sourceName)}
            testId="monitor-intel-source-name"
          />
          <Row
            label="Published"
            value={formatMonitorText(verifiedCatalyst.publicationTime)}
            testId="monitor-intel-published-at"
          />
          <Row
            label="First seen"
            value={formatMonitorText(verifiedCatalyst.firstSeenTime)}
            testId="monitor-intel-first-seen"
          />
          <Row
            label="Confirmation"
            value={formatMonitorText(verifiedCatalyst.confirmationLevel)}
          />
        </Section>

        <Section
          id="what-market-doing"
          title="2 · What the market is doing"
          blurb="Reaction structure after the event."
        >
          <span data-intel-section="current-state" className="sr-only" />
          <span data-intel-section="market-movement" className="sr-only" />
          <Row
            label="Momentum state"
            value={stateLabel}
            accent={/BREAKING|ACTIVE/i.test(stateLabel)}
          />
          <Row
            label="Reaction stage"
            value={formatMonitorText(currentState.reactionStage)}
          />
          <Row
            label="Move since catalyst"
            value={formatMonitorNumber(marketMovement.moveSinceCatalystPct, {
              digits: 2,
              suffix: "%",
            })}
            warn={
              marketMovement.moveSinceCatalystPct.availability === "unavailable"
            }
          />
          <Row
            label="Volume acceleration"
            value={formatMonitorNumber(marketMovement.dollarVolumeVelocity, {
              compact: true,
              prefix: "$",
            })}
            hint="Dollar-volume velocity — inspection only"
          />
          <Row
            label="Relative volume"
            value={formatMonitorNumber(marketMovement.relativeVolume, {
              digits: 2,
              suffix: "x",
            })}
          />
          <Row
            label="HOD context"
            value={formatMonitorText(marketMovement.hodContext)}
          />
          <Row
            label="VWAP context"
            value={formatMonitorText(marketMovement.vwapContext)}
          />
          <Row
            label="Attention"
            value={formatMonitorNumber(currentState.attentionPriority, {
              digits: 0,
            })}
            testId="monitor-intel-attention"
          />
          {latestTimeline ? (
            <div data-testid="monitor-intel-timeline">
              <Row
                label="Latest event"
                value={`${latestTimeline.summary} · ${ageLabel(
                  latestTimeline.atMs,
                  latestTimeline.timeUnavailable
                )}`}
              />
            </div>
          ) : null}
        </Section>

        <Section
          id="tradeability"
          title="3 · Can it be traded cleanly"
          blurb="Friction and data quality — separate from direction."
          accent={tradeWarn}
        >
          <Row
            label="Tradeability"
            value={formatMonitorText(currentState.tradeability)}
            testId="monitor-intel-tradeability"
            warn={tradeWarn}
          />
          <Row
            label="Spread"
            value={
              marketMovement.spreadBps.availability !== "unavailable"
                ? formatMonitorNumber(marketMovement.spreadBps, {
                    digits: 1,
                    suffix: " bps",
                  })
                : formatMonitorNumber(marketMovement.spreadDollars, {
                    digits: 4,
                    prefix: "$",
                  })
            }
            warn={tradeWarn}
          />
          <Row
            label="Dollar volume"
            value={formatMonitorNumber(marketMovement.dollarVolumeVelocity, {
              compact: true,
              prefix: "$",
            })}
          />
          <Row
            label="Relative volume"
            value={formatMonitorNumber(marketMovement.relativeVolume, {
              digits: 2,
              suffix: "x",
            })}
          />
          <Row
            label="Float confidence"
            value="Unavailable"
            hint="Float confidence is not invented when missing"
          />
          <Row
            label="Quote freshness"
            value={quoteFreshnessLabel(dossier)}
            testId="monitor-intel-data-confidence"
            warn={
              /low|reduced|stale|degraded/i.test(quoteFreshnessLabel(dossier))
            }
          />
        </Section>

        <Section
          id="what-could-go-wrong"
          title="4 · What could go wrong"
          blurb="Capital and structure risks — not the same as a down-tape."
        >
          <span data-intel-section="primary-risks" className="sr-only" />
          <div className="tt-intel__risk-block">
            {activeRisks.length === 0 ? (
              <p className="tt-intel__note">No active high-priority risks.</p>
            ) : null}
            <ul className="tt-intel__risk-list" data-testid="monitor-intel-risks">
              {(activeRisks.length > 0
                ? activeRisks
                : dossier.primaryRisks.filter((r) =>
                    ["halt", "dilution", "offering", "wide_spread"].includes(
                      r.kind
                    )
                  )
              ).map((r) => (
                <li
                  key={r.kind}
                  data-risk={r.kind}
                  data-status={r.status}
                  className="tt-intel__risk-row"
                >
                  <span className="tt-intel__risk-label">{r.label}</span>
                  <span className="tt-intel__risk-detail">
                    {r.status === "active"
                      ? r.detail
                        ? r.detail
                        : "Active"
                      : r.status === "clear"
                        ? "Clear"
                        : "Unavailable"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <Row
            label="Dilution / offering"
            value={dilutionSummary}
            risk={dilutionActive.length > 0}
          />
          <Row
            label="Halt status"
            value={
              haltActive
                ? dossier.primaryRisks.find((r) => r.kind === "halt")?.detail ??
                  "Active"
                : "Clear"
            }
            risk={haltActive}
          />
          <Row
            label="Extended / stale reaction"
            value={
              dossier.primaryRisks.find((r) => r.kind === "extended_reaction")
                ?.status === "active"
                ? dossier.primaryRisks.find((r) => r.kind === "extended_reaction")
                    ?.detail ?? "Active"
                : dossier.primaryRisks.find((r) => r.kind === "stale_news")
                      ?.status === "active"
                  ? "Stale news"
                  : "Clear"
            }
            risk={
              dossier.primaryRisks.some(
                (r) =>
                  (r.kind === "extended_reaction" || r.kind === "stale_news") &&
                  r.status === "active"
              )
            }
          />
          {dossier.evidence.missingOrUncertain.length > 0 ? (
            dossier.evidence.missingOrUncertain.slice(0, 3).map((f, i) => (
              <Row
                key={`miss-warn-${i}`}
                label="Missing data"
                value={formatMonitorText(f)}
                warn
              />
            ))
          ) : (
            <Row label="Missing data" value="None flagged" />
          )}
        </Section>

        <Section
          id="evidence"
          title="5 · Evidence"
          blurb="Sources and structured facts. Unavailable stays labelled."
        >
          <Row
            label="Primary source"
            value={formatMonitorText(dossier.evidence.primarySource)}
          />
          {evidenceUrl ? (
            <a
              className="tt-intel__link"
              href={evidenceUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open primary source
            </a>
          ) : (
            <Row label="Primary source link" value="Unavailable" />
          )}
          <DeferredFilingEvidence
            dossier={dossier}
            hasFilingData={
              dossier.evidence.secFilings.length > 0 ||
              dossier.evidence.supportingFacts.length > 0
            }
          />
        </Section>

        <MonitorLoadBoundary
          id="selected-ticker-supplemental"
          label="Supplemental intelligence unavailable"
        >
          <DeferredAnaloguesSection
            dossier={dossier}
            open={!!openSecondary["historical-analogues"]}
            onToggle={() => toggleSecondary("historical-analogues")}
          />
          <DeferredPersonalSection
            dossier={dossier}
            section="capital-risk-timeline"
            title="Full capital-risk timeline"
            open={!!openSecondary["capital-risk-timeline"]}
            onToggle={() => toggleSecondary("capital-risk-timeline")}
          />
          <DeferredPersonalSection
            dossier={dossier}
            section="personal-feedback"
            title="Personal feedback"
            open={!!openSecondary["personal-feedback"]}
            onToggle={() => toggleSecondary("personal-feedback")}
          />
          <DeferredPersonalSection
            dossier={dossier}
            section="autopsy"
            title="Catalyst autopsy"
            open={!!openSecondary["autopsy"]}
            onToggle={() => toggleSecondary("autopsy")}
          />
          <DeferredPersonalSection
            dossier={dossier}
            section="additional-market-statistics"
            title="Additional statistics"
            open={!!openSecondary["additional-market-statistics"]}
            onToggle={() => toggleSecondary("additional-market-statistics")}
          />
        </MonitorLoadBoundary>

        <p className="tt-intel__disclaimer">{dossier.disclaimer}</p>
      </div>
    </div>
  );
}
