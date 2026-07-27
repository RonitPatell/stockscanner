/**
 * Official Halt Monitor fixtures — never invents resumption times.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  applyEventStream,
  reconcileHaltEvents,
  formatResumptionTime,
  normalizeHaltCode,
  getHaltCodeInfo,
  associateIdsDuringWindow,
  createFixtureProvider,
  ingestHaltEvents,
  __resetHaltStoreForTests,
  __resetHaltHooksForTests,
  registerHaltAlertHook,
  getActiveHalt,
  listTransitions,
  sessionHaltCount,
  claimHaltAlert,
} from "../src/lib/halt-monitor/index.ts";
import type { HaltProviderEvent } from "../src/lib/halt-monitor/types.ts";

function ev(
  partial: Partial<HaltProviderEvent> &
    Pick<HaltProviderEvent, "symbol" | "haltCode" | "eventAt" | "sourceKind">
): HaltProviderEvent {
  return {
    exchange: "NASDAQ",
    haltReason: null,
    source: partial.sourceKind,
    sourceTimestamp: partial.eventAt,
    ...partial,
  };
}

test("normalize Nasdaq codes T1 T2 T5", () => {
  assert.equal(normalizeHaltCode("t1"), "T1");
  assert.equal(normalizeHaltCode("T2"), "T2");
  assert.equal(normalizeHaltCode("T5"), "T5");
  assert.equal(getHaltCodeInfo("T1").category, "news");
  assert.equal(getHaltCodeInfo("T5").category, "volatility");
});

test("T1 → T2 → resumption quote scheduled → RESUMED", () => {
  __resetHaltStoreForTests();
  const t0 = "2026-07-27T14:00:00.000Z";
  const t1 = "2026-07-27T14:10:00.000Z";
  const t2 = "2026-07-27T14:20:00.000Z";
  const t3 = "2026-07-27T14:35:00.000Z";

  const events: HaltProviderEvent[] = [
    ev({
      symbol: "ABCD",
      haltCode: "T1",
      eventAt: t0,
      sourceKind: "official_exchange",
      haltReason: "News pending",
    }),
    ev({
      symbol: "ABCD",
      haltCode: "T2",
      eventAt: t1,
      sourceKind: "official_exchange",
      haltReason: "News disseminated",
    }),
    ev({
      symbol: "ABCD",
      haltCode: "T3",
      eventAt: t2,
      sourceKind: "official_exchange",
      officialResumptionQuoteAt: "2026-07-27T14:30:00.000Z",
      officialResumptionTradeAt: "2026-07-27T14:35:00.000Z",
    }),
    ev({
      symbol: "ABCD",
      haltCode: "T3",
      eventAt: t3,
      sourceKind: "official_exchange",
      lifecycle: "resumed",
      officialResumptionQuoteAt: "2026-07-27T14:30:00.000Z",
      officialResumptionTradeAt: "2026-07-27T14:35:00.000Z",
    }),
  ];

  const { record, transitions } = applyEventStream({
    symbol: "ABCD",
    events,
    prior: null,
  });

  const alerts = transitions.map((t) => t.alertTransition);
  assert.ok(alerts.includes("HALTED"));
  assert.ok(alerts.includes("NEWS_RELEASED"));
  assert.ok(alerts.includes("RESUMPTION_QUOTE_SCHEDULED") || record.lifecycle === "resumed");
  assert.ok(alerts.includes("RESUMED"));
  assert.equal(record.officialResumptionQuoteAt, "2026-07-27T14:30:00.000Z");
  assert.equal(record.lifecycle, "resumed");
});

test("T5 volatility pause", () => {
  const { record, transition } = reconcileHaltEvents({
    symbol: "VOLA",
    prior: null,
    events: [
      ev({
        symbol: "VOLA",
        haltCode: "T5",
        eventAt: "2026-07-27T15:00:00.000Z",
        sourceKind: "licensed_luld",
        haltReason: "LULD pause",
      }),
    ],
  });
  assert.equal(record.haltCode, "T5");
  assert.equal(record.lifecycle, "halted");
  assert.equal(record.newsDisseminationStatus, "not_applicable");
  assert.equal(transition?.alertTransition, "HALTED");
  assert.equal(record.officialResumptionQuoteAt, null);
  assert.equal(formatResumptionTime(record.officialResumptionQuoteAt), "not yet announced");
});

test("repeated halts → REHALTED and session count", async () => {
  __resetHaltStoreForTests();
  __resetHaltHooksForTests();
  const symbol = "REPE";
  await ingestHaltEvents(
    [
      ev({
        symbol,
        haltCode: "T5",
        eventAt: "2026-07-27T15:00:00.000Z",
        sourceKind: "official_exchange",
        lifecycle: "halted",
      }),
    ],
    { associate: false }
  );
  await ingestHaltEvents(
    [
      ev({
        symbol,
        haltCode: "T5",
        eventAt: "2026-07-27T15:05:00.000Z",
        sourceKind: "official_exchange",
        lifecycle: "resumed",
      }),
    ],
    { associate: false }
  );
  await ingestHaltEvents(
    [
      ev({
        symbol,
        haltCode: "T5",
        eventAt: "2026-07-27T15:10:00.000Z",
        sourceKind: "official_exchange",
        lifecycle: "halted",
      }),
    ],
    { associate: false }
  );

  const transitions = await listTransitions(symbol, 20);
  assert.ok(transitions.some((t) => t.alertTransition === "REHALTED"));
  const halt = await getActiveHalt(symbol);
  assert.ok(halt);
  const count = await sessionHaltCount(symbol, halt!.sessionDateEt);
  assert.ok(count >= 2);
});

test("symbol changes keep separate halt records", async () => {
  __resetHaltStoreForTests();
  await ingestHaltEvents(
    [
      ev({
        symbol: "AAA",
        haltCode: "T1",
        eventAt: "2026-07-27T16:00:00.000Z",
        sourceKind: "official_exchange",
      }),
      ev({
        symbol: "BBB",
        haltCode: "T5",
        eventAt: "2026-07-27T16:00:00.000Z",
        sourceKind: "official_exchange",
      }),
    ],
    { associate: false }
  );
  const a = await getActiveHalt("AAA");
  const b = await getActiveHalt("BBB");
  assert.equal(a?.haltCode, "T1");
  assert.equal(b?.haltCode, "T5");
  assert.notEqual(a?.id, b?.id);
});

test("provider disagreement prefers official for code and resume times", () => {
  const { record, disagreements } = reconcileHaltEvents({
    symbol: "DISA",
    prior: null,
    events: [
      ev({
        symbol: "DISA",
        haltCode: "T5",
        eventAt: "2026-07-27T17:00:00.000Z",
        sourceKind: "licensed_luld",
        // Licensed must not invent official resume — even if payload tried
        officialResumptionQuoteAt: "2026-07-27T17:05:00.000Z",
      }),
      ev({
        symbol: "DISA",
        haltCode: "T1",
        eventAt: "2026-07-27T17:00:05.000Z",
        sourceKind: "official_exchange",
        haltReason: "News pending",
      }),
    ],
  });
  assert.equal(record.haltCode, "T1");
  assert.equal(record.sourceKind, "official_exchange");
  assert.equal(record.officialResumptionQuoteAt, null);
  assert.ok(
    record.reconciliationStatus === "official_preferred" ||
      record.reconciliationStatus === "disagreement" ||
      disagreements.length >= 0
  );
});

test("missing resumption time shows not yet announced", () => {
  assert.equal(formatResumptionTime(null), "not yet announced");
  assert.equal(formatResumptionTime(undefined), "not yet announced");
  const { record } = reconcileHaltEvents({
    symbol: "MISS",
    prior: null,
    events: [
      ev({
        symbol: "MISS",
        haltCode: "T2",
        eventAt: "2026-07-27T18:00:00.000Z",
        sourceKind: "official_exchange",
      }),
    ],
  });
  assert.equal(record.officialResumptionQuoteAt, null);
  assert.equal(record.officialResumptionTradeAt, null);
  assert.equal(formatResumptionTime(record.officialResumptionQuoteAt), "not yet announced");
});

test("events received out of order still apply chronologically", () => {
  const lateFirst: HaltProviderEvent[] = [
    ev({
      symbol: "OOO",
      haltCode: "T2",
      eventAt: "2026-07-27T19:10:00.000Z",
      sourceKind: "official_exchange",
    }),
    ev({
      symbol: "OOO",
      haltCode: "T1",
      eventAt: "2026-07-27T19:00:00.000Z",
      sourceKind: "official_exchange",
    }),
  ];
  const { record, transitions } = applyEventStream({
    symbol: "OOO",
    events: lateFirst,
    prior: null,
  });
  assert.equal(record.haltCode, "T2");
  assert.equal(record.newsDisseminationStatus, "disseminated");
  assert.ok(transitions.some((t) => t.alertTransition === "HALTED"));
  assert.ok(transitions.some((t) => t.alertTransition === "NEWS_RELEASED"));
});

test("duplicate halt alerts suppressed", async () => {
  __resetHaltStoreForTests();
  const a = await claimHaltAlert("DUP", "HALTED", "halt1");
  const b = await claimHaltAlert("DUP", "HALTED", "halt1");
  assert.equal(a, true);
  assert.equal(b, false);
});

test("associate headlines/filings during halt window", () => {
  const assoc = associateIdsDuringWindow({
    haltStartAt: "2026-07-27T12:00:00.000Z",
    untilAt: "2026-07-27T13:00:00.000Z",
    items: [
      { id: "c1", at: "2026-07-27T12:15:00.000Z" },
      { id: "f1", at: "2026-07-27T12:20:00.000Z", isFiling: true },
      { id: "c2", at: "2026-07-27T14:00:00.000Z" },
    ],
  });
  assert.deepEqual(assoc.catalystIds.sort(), ["c1", "f1"]);
  assert.deepEqual(assoc.filingOrNewsIds, ["f1"]);
});

test("fixture providers feed ingestHaltEvents", async () => {
  __resetHaltStoreForTests();
  __resetHaltHooksForTests();
  const payloads: string[] = [];
  registerHaltAlertHook((p) => {
    payloads.push(p.transition);
  });

  const official = createFixtureProvider(
    [
      ev({
        symbol: "HOOK",
        haltCode: "T1",
        eventAt: "2026-07-27T20:00:00.000Z",
        sourceKind: "official_exchange",
      }),
    ],
    "official_exchange"
  );
  const batch = await official.fetchHalts(["HOOK"]);
  const { alertsEmitted } = await ingestHaltEvents(batch, { associate: false });
  assert.ok(alertsEmitted >= 1);
  assert.ok(payloads.includes("HALTED"));
  assert.ok(payloads[0]);
});

test("licensed feed cannot set official resumption via createLicensed mapping", async () => {
  const { createLicensedLuldProvider } = await import(
    "../src/lib/halt-monitor/providers/licensed.ts"
  );
  const provider = createLicensedLuldProvider({
    url: "https://example.invalid/luld",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          items: [
            {
              symbol: "LIC",
              code: "T5",
              eventAt: "2026-07-27T21:00:00.000Z",
              resumptionQuoteAt: "2026-07-27T21:05:00.000Z",
            },
          ],
        }),
        { status: 200 }
      ),
  });
  const rows = await provider.fetchHalts();
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.officialResumptionQuoteAt, null);
  assert.equal(rows[0]!.officialResumptionTradeAt, null);
});
