"use client";

/**
 * Visual-only component gallery for TrustTicker Monitor design tokens.
 * No market math, auth, or billing.
 */
import type { ReactNode } from "react";
import "./monitor-tokens.css";
import "../monitor.css";
import "./monitor-gallery.css";

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="tt-gallery__section" data-gallery-section={title}>
      <h2 className="tt-gallery__h">{title}</h2>
      <div className="tt-gallery__canvas">{children}</div>
    </section>
  );
}

function FieldNodeDemo({
  symbol,
  ring,
  selected,
}: {
  symbol: string;
  ring: "centre" | "inner" | "outer";
  selected?: boolean;
}) {
  const r = ring === "centre" ? 28 : ring === "inner" ? 20 : 16;
  return (
    <div
      className="tt-gallery__node"
      data-ring={ring}
      data-selected={selected ? "true" : "false"}
    >
      <svg width={r * 2 + 24} height={r * 2 + 36} aria-hidden>
        <circle
          className="tt-field__disk"
          cx={r + 12}
          cy={r + 8}
          r={r}
          fill={
            selected
              ? "color-mix(in srgb, var(--mon-brand) 35%, var(--mon-field))"
              : "var(--mon-surface-2)"
          }
          stroke={selected ? "var(--mon-brand)" : "var(--mon-border-strong)"}
          strokeWidth={selected ? 2.5 : 1.25}
        />
        <text
          className="tt-field__sym"
          x={r + 12}
          y={r + 12}
          textAnchor="middle"
        >
          {symbol}
        </text>
        <text
          className="tt-field__state"
          x={r + 12}
          y={r * 2 + 22}
          textAnchor="middle"
        >
          {ring.toUpperCase()}
        </text>
      </svg>
    </div>
  );
}

export function MonitorDesignGallery() {
  return (
    <div
      className="tt-monitor tt-monitor-gallery"
      data-testid="monitor-design-gallery"
    >
      <header className="tt-gallery__hero">
        <p className="tt-gallery__product">TrustTicker Monitor</p>
        <h1 className="tt-gallery__page">Design system gallery</h1>
        <p className="tt-gallery__lead">
          Institutional desk tokens — calm, high-information, field-first.
          Visual reference only.
        </p>
      </header>

      <Section title="Status chips">
        <div className="tt-gallery__row">
          <span className="tt-monitor__pill">Neutral</span>
          <span className="tt-monitor__pill" data-tone="live">
            Live
          </span>
          <span className="tt-monitor__pill" data-tone="warn">
            Stale
          </span>
          <span className="tt-monitor__pill" data-tone="info">
            Verified
          </span>
          <span className="tt-monitor__pill" data-tone="danger">
            Critical
          </span>
        </div>
      </Section>

      <Section title="Priority rows">
        <div className="tt-ladder tt-gallery__ladder">
          <div className="tt-ladder__row" data-active="true">
            <button type="button" className="tt-ladder__main">
              <span aria-hidden>◆</span>
              <span className="tt-num">1</span>
              <span className="tt-ladder__sym">AAAA</span>
              <span className="tt-ladder__dir">↑</span>
              <span className="tt-num">82.4</span>
              <span>BUILDING</span>
              <span className="tt-num">+4.2%</span>
              <span className="tt-num">3.1×</span>
              <span className="tt-num">09:32</span>
              <span />
            </button>
          </div>
          <div className="tt-ladder__row">
            <button type="button" className="tt-ladder__main">
              <span aria-hidden>○</span>
              <span className="tt-num">2</span>
              <span className="tt-ladder__sym">BBBB</span>
              <span className="tt-ladder__dir">→</span>
              <span className="tt-num">61.0</span>
              <span>EMERGING</span>
              <span className="tt-num">+1.1%</span>
              <span className="tt-num">1.4×</span>
              <span className="tt-num">09:31</span>
              <span />
            </button>
          </div>
          <div className="tt-ladder__row" data-muted="true">
            <button type="button" className="tt-ladder__main">
              <span aria-hidden>○</span>
              <span className="tt-num">3</span>
              <span className="tt-ladder__sym">CCCC</span>
              <span className="tt-ladder__dir">↓</span>
              <span className="tt-num">28.0</span>
              <span>COOLING</span>
              <span className="tt-num">−0.8%</span>
              <span className="tt-num">0.9×</span>
              <span className="tt-num">09:30</span>
              <span />
            </button>
          </div>
        </div>
      </Section>

      <Section title="Momentum nodes">
        <div className="tt-gallery__field-demo tt-monitor__field">
          <FieldNodeDemo symbol="LEAD" ring="centre" selected />
          <FieldNodeDemo symbol="INNR" ring="inner" />
          <FieldNodeDemo symbol="OUTR" ring="outer" />
        </div>
      </Section>

      <Section title="Selected-ticker header">
        <div className="tt-monitor__intel tt-gallery__intel">
          <div className="tt-monitor__intel-identity">
            <span className="tt-monitor__intel-ticker">AAAA</span>
            <span className="tt-monitor__pill" data-tone="live">
              Leader
            </span>
          </div>
          <p className="tt-monitor__intel-note">
            Attention priority 82 · Momentum BUILDING · Not a trade cue
          </p>
          <div className="tt-gallery__kv">
            <span>Last</span>
            <span className="tt-num">$4.82</span>
            <span>Change</span>
            <span className="tt-num" style={{ color: "var(--mon-positive)" }}>
              +4.20%
            </span>
            <span>RVol</span>
            <span className="tt-num">3.10×</span>
          </div>
        </div>
      </Section>

      <Section title="Risk warnings">
        <div className="tt-gallery__risk" data-warn="true">
          Extremely thin spread — tradeability deteriorated. Informational only.
        </div>
        <div className="tt-gallery__risk" data-critical="true">
          Halt — official status. No invented resumption time.
        </div>
      </Section>

      <Section title="Event Tape items">
        <ul className="tt-tape tt-gallery__tape">
          <li className="tt-tape__item" data-kind="catalyst">
            <span className="tt-tape__sym">AAAA</span>
            <span className="tt-tape__headline">
              Verified catalyst published — source visible in intelligence
            </span>
            <span className="tt-tape__meta tt-num">09:32:14</span>
          </li>
          <li className="tt-tape__item" data-kind="risk">
            <span className="tt-tape__sym">FFFF</span>
            <span className="tt-tape__headline">Halt notice — official feed</span>
            <span className="tt-tape__meta tt-num">09:28:01</span>
          </li>
        </ul>
      </Section>

      <Section title="Empty states">
        <div className="tt-ladder__empty" data-testid="gallery-empty">
          Nothing to inspect yet — no symbols meet the current filter.
        </div>
      </Section>

      <Section title="Loading states">
        <div className="tt-gallery__state" data-state="loading">
          <span className="tt-gallery__pulse" aria-hidden />
          Connecting to Monitor delivery…
        </div>
      </Section>

      <Section title="Stale-data states">
        <div className="tt-gallery__state" data-state="stale">
          <span className="tt-monitor__pill" data-tone="warn">
            Stale
          </span>
          Values marked stale — not live. Do not treat as current tape.
        </div>
      </Section>

      <Section title="Disconnected states">
        <div className="tt-gallery__state" data-state="disconnected">
          <span className="tt-monitor__pill" data-tone="danger">
            Disconnected
          </span>
          Stream unavailable. Feed and legacy desk remain available.
        </div>
      </Section>

      <Section title="Tooltips">
        <div className="tt-gallery__tooltip" role="tooltip">
          Attention priority ranks inspection order — not directional edge.
        </div>
      </Section>

      <Section title="Drawers">
        <div className="tt-gallery__drawer">
          <div className="tt-monitor__panel-h">
            <span>Selected ticker</span>
            <button type="button" className="tt-monitor__drawer-btn">
              Close
            </button>
          </div>
          <div className="tt-monitor__intel">
            <span className="tt-monitor__intel-ticker">BBBB</span>
            <p className="tt-monitor__intel-note">Drawer / overlay sample</p>
          </div>
        </div>
      </Section>

      <Section title="Popovers">
        <div className="tt-gallery__popover">
          <strong className="tt-gallery__popover-title">Explain rank</strong>
          <p>
            Priority reflects attention score and freshness. Not predicted
            profit.
          </p>
        </div>
      </Section>

      <footer className="tt-gallery__footer">
        Tokens: canvas · surfaces · semantic status · 8px spacing · tabular nums
      </footer>
    </div>
  );
}
