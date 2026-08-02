"use client";

import { MONITOR_LOADING_SYSTEMS, MONITOR_LOADING_TITLE } from "./monitor-state-copy.ts";

/**
 * Structured skeleton matching the Monitor command layout.
 * Never shows fake prices or placeholder tickers.
 */
export function MonitorLoadingSkeleton({
  systems = MONITOR_LOADING_SYSTEMS,
}: {
  systems?: readonly string[];
}) {
  return (
    <div
      className="tt-mon-state tt-mon-state--loading"
      data-testid="monitor-state-loading"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={MONITOR_LOADING_TITLE}
    >
      <header className="tt-mon-state__head">
        <h2 className="tt-mon-state__title">{MONITOR_LOADING_TITLE}</h2>
        <p className="tt-mon-state__body">
          Structured layout is ready. Waiting on live systems — no placeholder
          tickers or prices.
        </p>
        <ul className="tt-mon-state__systems" aria-label="Systems connecting">
          {systems.map((s) => (
            <li key={s} data-connecting="true">
              <span className="tt-mon-state__sys-dot" aria-hidden />
              {s}
              <span className="tt-mon-state__sys-meta">Connecting…</span>
            </li>
          ))}
        </ul>
      </header>

      <div className="tt-mon-state__skel-grid" aria-hidden>
        <div className="tt-mon-state__skel-col">
          <div className="tt-mon-state__skel-h" />
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="tt-mon-state__skel-row" />
          ))}
        </div>
        <div className="tt-mon-state__skel-field">
          <div className="tt-mon-state__skel-ring" />
          <div className="tt-mon-state__skel-ring tt-mon-state__skel-ring--mid" />
        </div>
        <div className="tt-mon-state__skel-col">
          <div className="tt-mon-state__skel-h" />
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="tt-mon-state__skel-row" />
          ))}
        </div>
        <div className="tt-mon-state__skel-tape">
          <div className="tt-mon-state__skel-row" />
          <div className="tt-mon-state__skel-row" />
        </div>
      </div>
    </div>
  );
}
