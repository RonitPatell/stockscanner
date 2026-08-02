"use client";

import { formatMonitorText } from "../selected-ticker/selected-ticker-format.ts";
import type { MonitorSelectedTicker } from "../selected-ticker/selected-ticker-types.ts";

function ageLabel(atMs: number | null | undefined, unavailable?: boolean): string {
  if (unavailable || atMs == null) return "Unavailable";
  const ms = Date.now() - atMs;
  if (ms < 1000) return "<1s ago";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  return `${Math.round(ms / 60_000)}m ago`;
}

/**
 * Personal feedback, autopsy, long timeline, extra stats —
 * deferred personal-data boundary content.
 */
export function SelectedTickerPersonal({
  dossier,
  section,
}: {
  dossier: MonitorSelectedTicker;
  section:
    | "personal-feedback"
    | "autopsy"
    | "capital-risk-timeline"
    | "additional-market-statistics";
}) {
  if (section === "personal-feedback") {
    return (
      <div data-testid="monitor-personal-feedback" data-progressive="personal-data">
        <div className="tt-intel__row">
          <span className="tt-intel__label">Feedback</span>
          <span className="tt-intel__value">
            {formatMonitorText(dossier.collapsed.personalFeedback)}
          </span>
        </div>
      </div>
    );
  }

  if (section === "autopsy") {
    return (
      <div data-testid="monitor-personal-autopsy" data-progressive="personal-data">
        <div className="tt-intel__row">
          <span className="tt-intel__label">Autopsy</span>
          <span className="tt-intel__value">
            {formatMonitorText(dossier.collapsed.autopsy)}
          </span>
        </div>
      </div>
    );
  }

  if (section === "capital-risk-timeline") {
    return (
      <div data-testid="monitor-intel-timeline-full" data-progressive="personal-data">
        <span data-intel-section="event-timeline" className="sr-only" />
        {dossier.eventTimeline.length === 0 ? (
          <p className="tt-intel__note">Unavailable</p>
        ) : (
          <ul className="tt-intel__timeline">
            {dossier.eventTimeline.map((e) => (
              <li key={e.id}>
                <span className="tt-intel__timeline-time tt-num">
                  {ageLabel(e.atMs, e.timeUnavailable)}
                </span>
                <span className="tt-intel__timeline-kind">{e.kind}</span>
                <span>{e.summary}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const stats = dossier.collapsed.additionalMarketStatistics;
  return (
    <div data-testid="monitor-personal-stats" data-progressive="personal-data">
      {stats.length === 0 ? (
        <div className="tt-intel__row">
          <span className="tt-intel__label">Statistics</span>
          <span className="tt-intel__value">Unavailable</span>
        </div>
      ) : (
        stats.map((s, i) => (
          <div className="tt-intel__row" key={`stat-${i}`}>
            <span className="tt-intel__label">Stat {i + 1}</span>
            <span className="tt-intel__value">{formatMonitorText(s)}</span>
          </div>
        ))
      )}
    </div>
  );
}
