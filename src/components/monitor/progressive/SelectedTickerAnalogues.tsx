"use client";

import { formatMonitorText } from "../selected-ticker/selected-ticker-format.ts";
import type { MonitorSelectedTicker } from "../selected-ticker/selected-ticker-types.ts";

/** Historical analogues — deferred; never fabricated. */
export function SelectedTickerAnalogues({
  dossier,
}: {
  dossier: MonitorSelectedTicker;
}) {
  return (
    <div data-testid="monitor-analogues" data-progressive="analogue">
      <div className="tt-intel__row">
        <span className="tt-intel__label">Analogues</span>
        <span className="tt-intel__value">
          {formatMonitorText(dossier.collapsed.historicalAnalogues)}
        </span>
      </div>
    </div>
  );
}
