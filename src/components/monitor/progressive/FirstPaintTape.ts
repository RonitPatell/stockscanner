/**
 * Compact Event Tape from snapshot items — Node-testable createElement.
 */

import { createElement, type ReactElement } from "react";
import type { MonitorTapeItem } from "../../../domain/monitor/event-tape/types.ts";

export function FirstPaintTape(props: {
  items: MonitorTapeItem[];
  selectedSymbol?: string | null;
}): ReactElement {
  const { items, selectedSymbol } = props;
  const rows = items.slice(0, 12);

  return createElement(
    "div",
    {
      className: "tt-tape tt-tape--first-paint",
      "data-testid": "monitor-event-tape",
      "data-first-paint": "true",
      "aria-label": "Recent event tape",
    },
    createElement(
      "div",
      { className: "tt-tape__head" },
      createElement("span", { className: "tt-tape__title" }, "Event tape"),
      createElement("span", { className: "tt-tape__meta" }, `${rows.length} recent`)
    ),
    rows.length === 0
      ? createElement(
          "p",
          { className: "tt-intel__note" },
          "No recent events in snapshot."
        )
      : createElement(
          "ul",
          { className: "tt-tape__list" },
          ...rows.map((item) =>
            createElement(
              "li",
              {
                key: item.id,
                className: "tt-tape__row",
                "data-selected":
                  selectedSymbol &&
                  item.symbol.toUpperCase() === selectedSymbol.toUpperCase()
                    ? "true"
                    : "false",
              },
              createElement("strong", { className: "tt-num" }, item.symbol),
              createElement(
                "span",
                { className: "tt-tape__summary" },
                item.label || item.explanation
              )
            )
          )
        ),
    createElement(
      "p",
      { className: "tt-intel__note tt-intel__note--prog" },
      "Loading full tape…"
    )
  );
}
