"use client";

import {
  formatMonitorText,
} from "../selected-ticker/selected-ticker-format.ts";
import type { MonitorSelectedTicker } from "../selected-ticker/selected-ticker-types.ts";

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="tt-intel__row">
      <span className="tt-intel__label">{label}</span>
      <span
        className="tt-intel__value"
        data-warn={warn ? "true" : undefined}
      >
        {value}
      </span>
    </div>
  );
}

/** Filing excerpts + supporting facts — deferred supplemental evidence. */
export function SelectedTickerFilings({
  dossier,
}: {
  dossier: MonitorSelectedTicker;
}) {
  const filings = dossier.evidence.secFilings;
  const facts = dossier.evidence.supportingFacts;
  const uncertain = dossier.evidence.missingOrUncertain;

  return (
    <div data-testid="monitor-filing-evidence" data-progressive="filing-evidence">
      {filings.length === 0 ? (
        <Row label="Filings" value="Unavailable" />
      ) : (
        filings.map((f, i) => (
          <Row
            key={`sec-${i}`}
            label={`Filing ${i + 1}`}
            value={formatMonitorText(f)}
          />
        ))
      )}
      {facts.length === 0 ? (
        <Row label="Supporting facts" value="Unavailable" />
      ) : (
        facts.map((f, i) => (
          <Row
            key={`fact-${i}`}
            label={`Fact ${i + 1}`}
            value={formatMonitorText(f)}
          />
        ))
      )}
      {uncertain.length === 0 ? (
        <Row label="Uncertain fields" value="None flagged" />
      ) : (
        uncertain.map((f, i) => (
          <Row
            key={`unc-${i}`}
            label="Uncertain"
            value={formatMonitorText(f)}
            warn
          />
        ))
      )}
    </div>
  );
}
