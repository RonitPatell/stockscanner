/**
 * Dimension-stable progressive skeletons — createElement, no fabricated tickers.
 */

import { createElement, type ReactElement } from "react";

export function IntelPanelSkeleton(props?: {
  reason?: "awaiting-panel" | "awaiting-selection";
}): ReactElement {
  const reason = props?.reason ?? "awaiting-panel";
  return createElement(
    "div",
    {
      className: "tt-intel tt-intel__skeleton tt-mon-prog-skel",
      "data-testid": "monitor-intel-skeleton",
      "data-skel-reason": reason,
      "aria-busy": "true",
      "aria-label": "Loading intelligence panel",
    },
    createElement(
      "div",
      { className: "tt-intel__sticky" },
      createElement("div", { className: "tt-intel__sk-line tt-intel__sk-line--lg" }),
      createElement("div", { className: "tt-intel__sk-line tt-intel__sk-line--md" }),
      createElement(
        "div",
        { className: "tt-intel__sticky-metrics" },
        createElement("div", { className: "tt-intel__sk-box" }),
        createElement("div", { className: "tt-intel__sk-box" }),
        createElement("div", { className: "tt-intel__sk-box" })
      )
    ),
    ...[1, 2, 3, 4, 5].map((n) =>
      createElement(
        "div",
        { key: n, className: "tt-intel__section", "aria-hidden": true },
        createElement("div", { className: "tt-intel__sk-line tt-intel__sk-line--md" }),
        createElement("div", { className: "tt-intel__sk-line" }),
        createElement("div", {
          className: "tt-intel__sk-line tt-intel__sk-line--short",
        })
      )
    )
  );
}

export function TapePanelSkeleton(): ReactElement {
  return createElement(
    "div",
    {
      className: "tt-mon-prog-skel tt-mon-prog-skel--tape",
      "data-testid": "monitor-tape-skeleton",
      "aria-busy": "true",
      "aria-label": "Loading event tape",
    },
    createElement("div", { className: "tt-intel__sk-line tt-intel__sk-line--md" }),
    ...[1, 2, 3, 4, 5, 6].map((n) =>
      createElement(
        "div",
        {
          key: n,
          className: "tt-mon-prog-skel__tape-row",
          "aria-hidden": true,
        },
        createElement("div", {
          className: "tt-intel__sk-line tt-intel__sk-line--short",
        }),
        createElement("div", { className: "tt-intel__sk-line" })
      )
    )
  );
}

export function CollapsedSectionSkeleton(props: { title: string }): ReactElement {
  return createElement(
    "div",
    {
      className:
        "tt-intel__section tt-intel__section--secondary tt-mon-prog-skel",
      "data-testid": "monitor-collapsed-skeleton",
      "aria-busy": "true",
      "aria-label": `Loading ${props.title}`,
    },
    createElement(
      "div",
      { className: "tt-intel__collapse", "data-skel": "true" },
      createElement("span", null, props.title)
    )
  );
}

export function SupplementalBlockSkeleton(props: {
  rows?: number;
  label: string;
}): ReactElement {
  const rows = props.rows ?? 3;
  return createElement(
    "div",
    {
      className: "tt-mon-prog-skel tt-mon-prog-skel--supp",
      "data-testid": "monitor-supplemental-skeleton",
      "aria-busy": "true",
      "aria-label": `Loading ${props.label}`,
    },
    ...Array.from({ length: rows }, (_, i) =>
      createElement("div", {
        key: i,
        className: "tt-intel__sk-line",
        "aria-hidden": true,
      })
    )
  );
}

export function SecondaryPanelSkeleton(props: { label: string }): ReactElement {
  return createElement(
    "div",
    {
      className: "tt-mon-prog-skel tt-mon-prog-skel--secondary",
      "data-testid": "monitor-secondary-fallback",
      "data-label": props.label,
      "aria-busy": "true",
      "aria-label": `Loading ${props.label}`,
    },
    createElement("div", { className: "tt-intel__sk-line tt-intel__sk-line--md" }),
    createElement("div", { className: "tt-intel__sk-line" }),
    createElement("div", {
      className: "tt-intel__sk-line tt-intel__sk-line--short",
    })
  );
}
