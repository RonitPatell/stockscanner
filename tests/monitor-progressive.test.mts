import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EssentialSelectedTicker } from "../src/components/monitor/progressive/EssentialSelectedTicker.ts";
import { FirstPaintTape } from "../src/components/monitor/progressive/FirstPaintTape.ts";
import {
  IntelPanelSkeleton,
  TapePanelSkeleton,
} from "../src/components/monitor/progressive/skeletons.ts";
import { MonitorLoadBoundary } from "../src/components/monitor/progressive/MonitorLoadBoundary.ts";
import type { MonitorSelectedTicker } from "../src/components/monitor/selected-ticker/selected-ticker-types.ts";
import type { MonitorTapeItem } from "../src/domain/monitor/event-tape/types.ts";

function t(value: string | null) {
  return {
    value,
    availability: (value == null ? "unavailable" : "ok") as "ok" | "unavailable",
  };
}
function n(value: number | null) {
  return {
    value,
    availability: (value == null ? "unavailable" : "ok") as "ok" | "unavailable",
  };
}

/** Minimal dossier — cast after filling required progressive fields. */
function minimalDossier(symbol: string): MonitorSelectedTicker {
  return {
    symbol,
    identity: {
      ticker: symbol,
      company: t("Test Co"),
      price: n(1.25),
      sessionChangePct: n(12.5),
      momentumRank: n(null),
      pinned: false,
    },
    currentState: {
      momentumState: t("BUILDING"),
      reactionStage: t(null),
      tradeability: t("Tradeable"),
      attentionPriority: n(80),
      dataConfidence: t("high"),
    },
    verifiedCatalyst: {
      present: true,
      oneSentenceFact: t("Offering priced"),
      sourceName: t("PR"),
      sourceUrl: null,
      publicationTime: t(null),
      firstSeenTime: t(null),
      confirmationLevel: t(null),
      catalystAge: t(null),
    },
    marketMovement: {
      priceAtCatalyst: n(null),
      currentPrice: n(1.25),
      moveSinceCatalystPct: n(null),
      tradesPerSecond: n(null),
      dollarVolumeVelocity: n(null),
      relativeVolume: n(null),
      spreadDollars: n(null),
      spreadBps: n(null),
      hodContext: t(null),
      lodContext: t(null),
      vwapContext: t(null),
    },
    primaryRisks: [],
    eventTimeline: [],
    evidence: {
      primarySource: t("PR"),
      primarySourceUrl: null,
      secFilings: [],
      supportingFacts: [],
      missingOrUncertain: [],
    },
    collapsed: {
      historicalAnalogues: t(null),
      personalFeedback: t(null),
      autopsy: t(null),
      additionalMarketStatistics: [],
    },
    actions: { tradingViewUrl: "https://www.tradingview.com", sourceUrl: null },
    disclaimer: "Informational only",
  } as unknown as MonitorSelectedTicker;
}

test("essential selected ticker keeps real symbol — never fabricated placeholders", () => {
  const html = renderToStaticMarkup(
    createElement(EssentialSelectedTicker, {
      dossier: minimalDossier("AAAA"),
    })
  );
  assert.match(html, /AAAA/);
  assert.match(html, /data-essential="true"/);
  assert.doesNotMatch(html, /\bXXXX\b|PLACEHOLDER|SYM1|FAKE/i);
  assert.match(html, /Offering priced/);
});

test("first-paint tape renders snapshot items without inventing tickers", () => {
  const items = [
    {
      id: "e1",
      schemaVersion: "1",
      ruleVersion: "1",
      atMs: Date.now(),
      symbol: "BBBB",
      type: "MOMENTUM_BUILDING",
      label: "Building",
      explanation: "Momentum building",
      severity: "medium",
      sourceType: "momentum",
      dataConfidence: "high",
      intelSection: "current-state",
    },
  ] as MonitorTapeItem[];
  const html = renderToStaticMarkup(
    createElement(FirstPaintTape, { items, selectedSymbol: "BBBB" })
  );
  assert.match(html, /BBBB/);
  assert.match(html, /data-first-paint="true"/);
  assert.doesNotMatch(html, /AAAA|PLACEHOLDER/);
});

test("skeletons have no ticker placeholders", () => {
  const intel = renderToStaticMarkup(createElement(IntelPanelSkeleton, {}));
  const tape = renderToStaticMarkup(createElement(TapePanelSkeleton, {}));
  assert.match(intel, /monitor-intel-skeleton/);
  assert.match(tape, /monitor-tape-skeleton/);
  assert.doesNotMatch(intel + tape, /\$\d|AAAA|BBBB|TICKER/);
});

test("progressive boundary component exports", () => {
  assert.equal(typeof MonitorLoadBoundary, "function");
});
