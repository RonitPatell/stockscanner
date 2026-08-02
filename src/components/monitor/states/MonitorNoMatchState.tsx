"use client";

import {
  MONITOR_NO_MATCH_BODY,
  MONITOR_NO_MATCH_TITLE,
} from "./monitor-state-copy.ts";
import {
  MonitorEmptyActions,
  type MonitorEmptyActionsProps,
} from "./MonitorEmptyActions.tsx";

export function MonitorNoMatchState(props: MonitorEmptyActionsProps) {
  return (
    <div
      className="tt-mon-state tt-mon-state--no-match"
      data-testid="monitor-state-no-match"
      role="status"
      aria-live="polite"
    >
      <h2 className="tt-mon-state__title">{MONITOR_NO_MATCH_TITLE}</h2>
      <p className="tt-mon-state__body">{MONITOR_NO_MATCH_BODY}</p>
      <MonitorEmptyActions {...props} />
    </div>
  );
}
