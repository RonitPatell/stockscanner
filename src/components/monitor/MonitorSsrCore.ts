import { createElement, type ReactElement } from "react";
import type { MonitorInitialSnapshot } from "../../lib/monitor/ssr/types.ts";

/**
 * Server-rendered / static HTML core for Monitor first paint.
 * Present in the document with or without JavaScript.
 * Implemented with createElement so Node unit tests can import without JSX.
 */
export function MonitorSsrCore({
  initialSnapshot,
  suppressUnavailable = false,
}: {
  initialSnapshot: MonitorInitialSnapshot;
  /** After client hydration recovers, hide the loud unavailable panel. */
  suppressUnavailable?: boolean;
}): ReactElement {
  if (!initialSnapshot.ok || !initialSnapshot.snapshot) {
    // Never paint a large visible block in the live shell — it stacks on top
    // of the status bar / ladder. Keep a screen-reader + test hook only.
    return createElement(
      "div",
      {
        className: "sr-only",
        "data-testid": "monitor-snapshot-unavailable",
        role: "alert",
        "data-source": "UNAVAILABLE",
        "data-suppressed": suppressUnavailable ? "true" : "false",
      },
      initialSnapshot.error?.message ?? "Monitor snapshot unavailable",
      initialSnapshot.error?.code
        ? createElement(
            "span",
            { "data-testid": "monitor-snapshot-error-code" },
            ` ${initialSnapshot.error.code}`
          )
        : null
    );
  }

  const snap = initialSnapshot.snapshot;
  return createElement(
    "div",
    {
      className: "sr-only",
      "data-testid": "monitor-ssr-core",
      "data-source": initialSnapshot.source,
      "data-last-event-id": initialSnapshot.lastEventId ?? "",
      "data-generated-at": initialSnapshot.generatedAt,
      "data-data-age-ms":
        initialSnapshot.dataAgeMs != null
          ? String(initialSnapshot.dataAgeMs)
          : "",
    },
    createElement(
      "ol",
      { "data-testid": "monitor-ssr-ladder" },
      ...snap.priorityLadder.map((t) =>
        createElement(
          "li",
          {
            key: `ssr-l-${t.symbol}`,
            "data-symbol": t.symbol,
            "data-testid": `monitor-ssr-ticker-${t.symbol}`,
          },
          `${t.symbol}${t.companyShortName ? ` ${t.companyShortName}` : ""}${
            t.price != null ? ` ${t.price}` : ""
          }`
        )
      )
    ),
    createElement(
      "ul",
      { "data-testid": "monitor-ssr-field" },
      ...snap.momentumField.map((t) =>
        createElement(
          "li",
          {
            key: `ssr-f-${t.symbol}`,
            "data-symbol": t.symbol,
            "data-testid": `monitor-ssr-field-${t.symbol}`,
          },
          t.symbol
        )
      )
    ),
    initialSnapshot.selectedSummary
      ? createElement(
          "p",
          { "data-testid": "monitor-ssr-selected" },
          `${initialSnapshot.selectedSummary.symbol}${
            initialSnapshot.selectedSummary.momentumState
              ? ` ${initialSnapshot.selectedSummary.momentumState}`
              : ""
          }`
        )
      : null
  );
}
