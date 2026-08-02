"use client";

import {
  MONITOR_ERROR_BODY,
  MONITOR_ERROR_TITLE,
} from "./monitor-state-copy.ts";

export function MonitorErrorState({
  diagnosticId,
  onRetry,
}: {
  diagnosticId: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className="tt-mon-state tt-mon-state--error"
      data-testid="monitor-state-error"
      role="alert"
      aria-live="assertive"
    >
      <h2 className="tt-mon-state__title">{MONITOR_ERROR_TITLE}</h2>
      <p className="tt-mon-state__body">{MONITOR_ERROR_BODY}</p>
      <p className="tt-mon-state__diag">
        Diagnostic reference{" "}
        <code data-testid="monitor-diagnostic-id">{diagnosticId}</code>
      </p>
      {onRetry ? (
        <button
          type="button"
          className="tt-monitor__pill tt-mon-press"
          data-testid="monitor-error-retry"
          onClick={onRetry}
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
