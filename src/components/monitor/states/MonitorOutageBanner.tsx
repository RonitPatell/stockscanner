"use client";

import Link from "next/link";
import {
  MONITOR_OUTAGE_CATEGORIES,
  MONITOR_PUBLIC_STATUS_HREF,
  PARTIAL_DATA_EXAMPLES,
  outageCategoriesFromNotes,
  sanitizeProviderNotes,
} from "./monitor-state-copy.ts";
import type { MonitorConnectionState } from "../monitor-types.ts";

export function MonitorOutageBanner({
  connection,
  notes = [],
}: {
  connection: Extract<
    MonitorConnectionState,
    "degraded" | "delayed" | "partial_outage"
  >;
  notes?: string[];
}) {
  const safeNotes = sanitizeProviderNotes(notes);
  const cats = outageCategoriesFromNotes(safeNotes);
  const labels = MONITOR_OUTAGE_CATEGORIES.filter((c) =>
    cats.includes(c.id)
  ).map((c) => c.label);

  const headline =
    connection === "delayed"
      ? "Delayed data — values are not real-time."
      : connection === "partial_outage"
        ? "Partial provider outage — some fields are unavailable."
        : "Provider outage — stale values are marked and are not live.";

  return (
    <div
      className="tt-monitor__data-warning tt-mon-state__outage"
      data-testid="monitor-data-warning"
      data-connection={connection}
      role="status"
      aria-live="polite"
    >
      <div className="tt-mon-state__outage-main">
        <strong>{headline}</strong>
        <span className="tt-mon-state__outage-cats">
          Affected: {labels.join(" · ")}
        </span>
        <Link
          href={MONITOR_PUBLIC_STATUS_HREF}
          className="tt-mon-state__status-link"
          data-testid="monitor-status-link"
        >
          Public status
        </Link>
      </div>
      {connection === "partial_outage" ? (
        <ul
          className="tt-mon-state__partial-examples"
          data-testid="monitor-partial-examples"
        >
          {PARTIAL_DATA_EXAMPLES.map((ex) => (
            <li key={ex.unavailable}>
              <span data-available="true">{ex.available}</span>
              <span aria-hidden> · </span>
              <span data-unavailable="true">{ex.unavailable}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {safeNotes.length > 0 ? (
        <ul className="tt-mon-state__notes tt-mon-state__notes--inline">
          {safeNotes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
