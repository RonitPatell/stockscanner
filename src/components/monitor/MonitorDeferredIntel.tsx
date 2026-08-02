"use client";

import { Suspense, lazy, type ComponentProps } from "react";
import { MonitorLoadBoundary } from "./progressive/MonitorLoadBoundary.ts";
import { EssentialSelectedTicker } from "./progressive/EssentialSelectedTicker.ts";
import { FirstPaintTape } from "./progressive/FirstPaintTape.ts";
import {
  IntelPanelSkeleton,
  TapePanelSkeleton,
} from "./progressive/skeletons.ts";

/**
 * Progressive intel + tape:
 * - Valid dossier / tape items stay visible during chunk load (no skeleton wipe).
 * - Skeletons only when that surface has no snapshot data yet.
 * - Failures isolate to this boundary.
 */

const SelectedTickerPanelLazy = lazy(async () => {
  const m = await import("./selected-ticker/SelectedTickerPanel.tsx");
  return { default: m.SelectedTickerPanel };
});

const EventTapeLazy = lazy(async () => {
  const m = await import("./event-tape/EventTape.tsx");
  return { default: m.EventTape };
});

export function DeferredSelectedTickerPanel(
  props: ComponentProps<typeof SelectedTickerPanelLazy>
) {
  const hasDossier = Boolean(props.dossier);
  const fallback =
    hasDossier && props.dossier ? (
      <EssentialSelectedTicker
        dossier={props.dossier}
        compact={props.compact}
      />
    ) : (
      <IntelPanelSkeleton
        reason={props.loading ? "awaiting-panel" : "awaiting-selection"}
      />
    );

  return (
    <MonitorLoadBoundary
      id="selected-ticker-core"
      label="Selected ticker panel failed"
      className="tt-mon-boundary tt-mon-boundary--intel"
    >
      <Suspense fallback={fallback}>
        <SelectedTickerPanelLazy {...props} />
      </Suspense>
    </MonitorLoadBoundary>
  );
}

export function DeferredEventTape(
  props: ComponentProps<typeof EventTapeLazy>
) {
  const hasItems = props.items.length > 0;
  const fallback = hasItems ? (
    <FirstPaintTape
      items={props.items}
      selectedSymbol={props.selectedSymbol}
    />
  ) : (
    <TapePanelSkeleton />
  );

  return (
    <MonitorLoadBoundary
      id="event-tape"
      label="Event tape failed"
      className="tt-mon-boundary tt-mon-boundary--tape"
    >
      <Suspense fallback={fallback}>
        <EventTapeLazy {...props} />
      </Suspense>
    </MonitorLoadBoundary>
  );
}
