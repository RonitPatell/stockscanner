/**
 * First-paint selected-ticker essentials — createElement for Node-testable SSR.
 * Real snapshot/dossier fields only; never fabricated tickers.
 */

import { createElement, type ReactElement } from "react";
import type { MonitorSelectedTicker } from "../selected-ticker/selected-ticker-types.ts";
import {
  formatMonitorNumber,
  formatMonitorText,
} from "../selected-ticker/selected-ticker-format.ts";

export function EssentialSelectedTicker(props: {
  dossier: MonitorSelectedTicker;
  compact?: boolean;
}): ReactElement {
  const { dossier, compact = false } = props;
  const { identity, currentState, verifiedCatalyst } = dossier;
  const price = formatMonitorNumber(identity.price, {
    digits: 4,
    prefix: "$",
  });
  const sessionMove = formatMonitorNumber(identity.sessionChangePct, {
    digits: 2,
    suffix: "%",
  });
  const state = formatMonitorText(currentState.momentumState);
  const catalyst = verifiedCatalyst.present
    ? formatMonitorText(verifiedCatalyst.oneSentenceFact)
    : "No verified catalyst in snapshot";

  return createElement(
    "div",
    {
      className: "tt-monitor__intel tt-intel tt-intel--essential",
      "data-testid": "monitor-selected-ticker",
      "data-essential": "true",
      "data-symbol": identity.ticker,
      "data-compact": compact ? "true" : "false",
    },
    createElement(
      "header",
      { className: "tt-intel__sticky", "data-intel-section": "identity" },
      createElement(
        "div",
        { className: "tt-intel__sticky-top" },
        createElement(
          "div",
          { className: "tt-intel__sticky-id" },
          createElement("div", { className: "tt-intel__ticker" }, identity.ticker),
          createElement(
            "div",
            { className: "tt-intel__company" },
            formatMonitorText(identity.company)
          )
        )
      ),
      createElement(
        "div",
        { className: "tt-intel__sticky-metrics" },
        metric("Price", price),
        metric("Session", sessionMove),
        metric("State", state)
      )
    ),
    createElement(
      "section",
      {
        className: "tt-intel__section",
        "data-intel-section": "what-happened",
        "data-essential-section": "true",
      },
      createElement(
        "header",
        { className: "tt-intel__section-h" },
        createElement("h3", null, "1 · What happened")
      ),
      createElement(
        "div",
        { className: "tt-intel__section-body" },
        row("Catalyst", catalyst),
        row("Tradeability", formatMonitorText(currentState.tradeability))
      )
    ),
    createElement(
      "p",
      {
        className: "tt-intel__note tt-intel__note--prog",
        "data-testid": "monitor-intel-progressive",
      },
      "Loading full intelligence…"
    )
  );
}

function metric(label: string, value: string): ReactElement {
  return createElement(
    "div",
    { className: "tt-intel__metric" },
    createElement("span", { className: "tt-intel__metric-label" }, label),
    createElement("span", { className: "tt-intel__value tt-num" }, value)
  );
}

function row(label: string, value: string): ReactElement {
  return createElement(
    "div",
    { className: "tt-intel__row" },
    createElement("span", { className: "tt-intel__label" }, label),
    createElement("span", { className: "tt-intel__value" }, value)
  );
}
