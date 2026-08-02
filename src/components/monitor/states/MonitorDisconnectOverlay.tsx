"use client";

import {
  MONITOR_DISCONNECT_BODY,
  MONITOR_DISCONNECT_TITLE,
  sanitizeProviderNotes,
} from "./monitor-state-copy.ts";

export function MonitorDisconnectOverlay({
  notes = [],
  reconnectLabel = "Attempting to reconnect…",
  lastEventAgeLabel,
}: {
  notes?: string[];
  reconnectLabel?: string;
  lastEventAgeLabel?: string;
}) {
  const safeNotes = sanitizeProviderNotes(notes);
  return (
    <div
      className="tt-mon-state__overlay"
      data-testid="monitor-state-disconnected"
      role="alert"
      aria-live="assertive"
    >
      <div className="tt-mon-state__overlay-card">
        <h2 className="tt-mon-state__title">{MONITOR_DISCONNECT_TITLE}</h2>
        <p className="tt-mon-state__body">{MONITOR_DISCONNECT_BODY}</p>
        <p className="tt-mon-state__reconnect" data-testid="monitor-reconnect-status">
          {reconnectLabel}
        </p>
        {lastEventAgeLabel ? (
          <p className="tt-mon-state__meta">
            Last reliable event · {lastEventAgeLabel}
          </p>
        ) : null}
        {safeNotes.length > 0 ? (
          <ul className="tt-mon-state__notes">
            {safeNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
