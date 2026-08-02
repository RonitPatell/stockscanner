"use client";

import {
  MONITOR_QUIET_BODY,
  MONITOR_QUIET_TITLE,
  sanitizeProviderNotes,
} from "./monitor-state-copy.ts";
import {
  MonitorEmptyActions,
  type MonitorEmptyActionsProps,
} from "./MonitorEmptyActions.tsx";

export function MonitorQuietState({
  notes = [],
  ...actions
}: MonitorEmptyActionsProps & { notes?: string[] }) {
  const safeNotes = sanitizeProviderNotes(notes);
  return (
    <div
      className="tt-mon-state tt-mon-state--quiet"
      data-testid="monitor-state-quiet"
      role="status"
      aria-live="polite"
    >
      <h2 className="tt-mon-state__title">{MONITOR_QUIET_TITLE}</h2>
      <p className="tt-mon-state__body">{MONITOR_QUIET_BODY}</p>
      {safeNotes.length > 0 ? (
        <ul className="tt-mon-state__notes">
          {safeNotes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
      <MonitorEmptyActions {...actions} />
    </div>
  );
}
