/**
 * Monitor selected-ticker intelligence — hierarchy, unavailable marking,
 * event-price integrity, deep links, sticky selection merge.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSelectedTicker,
  stickSelectedTicker,
} from "../src/components/monitor/selected-ticker/build-selected-ticker.ts";
import { formatMonitorNumber } from "../src/components/monitor/selected-ticker/selected-ticker-format.ts";
import {
  MONITOR_INTEL_SECTIONS,
  MONITOR_PRIMARY_RISK_KINDS,
} from "../src/components/monitor/selected-ticker/selected-ticker-types.ts";
import {
  MONITOR_SYMBOL_PARAM,
  symbolFromSearchParams,
} from "../src/components/monitor/selected-ticker/deep-link.ts";
import type { MonitorLadderRow } from "../src/components/monitor/monitor-types.ts";
import { buildMonitorFixture } from "../src/components/monitor/monitor-fixtures.ts";
import {
  DASHBOARD_GUIDE_STEPS,
  PLATFORM_GUIDE_VERSION,
} from "../src/lib/platform-guide.ts";

function row(partial: Partial<MonitorLadderRow> & { symbol: string }): MonitorLadderRow {
  return {
    rank: 1,
    attentionPriority: 80,
    tier: "HIGH",
    momentumState: "ACTIVE",
    momentumIntensity: 50,
    direction: "up",
    reason: "test",
    onWatchlist: false,
    ...partial,
  };
}

test("platform guide bumped for selected-ticker dossier", () => {
  assert.ok(PLATFORM_GUIDE_VERSION >= 46);
  const step = DASHBOARD_GUIDE_STEPS.find((s) => s.id === "monitor-intel");
  assert.ok(step?.body.toLowerCase().includes("tradeability"));
  assert.ok(step?.body.toLowerCase().includes("unavailable"));
  assert.ok(step?.body.toLowerCase().includes("what happened"));
});

test("fixed section order lists tradeability/risks before analogues", () => {
  const ids = [...MONITOR_INTEL_SECTIONS];
  const happened = ids.indexOf("what-happened");
  const market = ids.indexOf("what-market-doing");
  const tradeability = ids.indexOf("tradeability");
  const risks = ids.indexOf("what-could-go-wrong");
  const evidence = ids.indexOf("evidence");
  const analogues = ids.indexOf("historical-analogues");
  const timeline = ids.indexOf("capital-risk-timeline");
  assert.ok(happened === 1);
  assert.ok(happened < market && market < tradeability);
  assert.ok(tradeability < risks && risks < evidence);
  assert.ok(evidence < analogues);
  assert.ok(analogues < timeline);
  assert.ok(risks < ids.indexOf("personal-feedback"));
  assert.ok(risks < ids.indexOf("autopsy"));
});

test("primary risk kinds cover required checklist", () => {
  const kinds = MONITOR_PRIMARY_RISK_KINDS.map((k) => k.kind);
  for (const need of [
    "dilution",
    "offering",
    "atm",
    "warrants",
    "reverse_split",
    "halt",
    "stale_news",
    "wide_spread",
    "ambiguous_data",
    "extended_reaction",
  ]) {
    assert.ok(kinds.includes(need as (typeof kinds)[number]), need);
  }
});

test("missing event price stays Unavailable — never backfilled from current", () => {
  const dossier = buildSelectedTicker({
    row: row({ symbol: "AAAA", hasCatalyst: true }),
    pinned: false,
    seed: {
      price: 4.82,
      priceAtCatalyst: null,
      catalyst: {
        fact: "Contract win announced.",
        sourceName: "Wire",
        sourceUrl: "https://example.com/a",
        publishedAt: new Date().toISOString(),
        firstSeenAt: new Date().toISOString(),
        confirmationLevel: "Medium (50)",
        ageSec: 600,
      },
    },
  });

  assert.equal(dossier.marketMovement.priceAtCatalyst.availability, "unavailable");
  assert.equal(dossier.marketMovement.currentPrice.value, 4.82);
  assert.equal(
    dossier.marketMovement.moveSinceCatalystPct.availability,
    "unavailable"
  );
  assert.equal(
    formatMonitorNumber(dossier.marketMovement.priceAtCatalyst, {
      prefix: "$",
      digits: 4,
    }),
    "Unavailable"
  );
  // Stick with a live tick that still lacks event price — must not invent.
  const stuck = stickSelectedTicker(
    dossier,
    buildSelectedTicker({
      row: row({ symbol: "AAAA", hasCatalyst: true, momentumIntensity: 55 }),
      pinned: false,
      seed: {
        price: 5.01,
        priceAtCatalyst: null,
        catalyst: {
          fact: "Contract win announced.",
          sourceName: "Wire",
        },
      },
    })
  );
  assert.equal(stuck.marketMovement.priceAtCatalyst.availability, "unavailable");
  assert.equal(stuck.marketMovement.currentPrice.value, 5.01);
  assert.notEqual(
    stuck.marketMovement.priceAtCatalyst.value,
    stuck.marketMovement.currentPrice.value
  );
});

test("event price + current price compute move; attribution preserved", () => {
  const dossier = buildSelectedTicker({
    row: row({ symbol: "BBBB", hasCatalyst: true, catalystVerified: true }),
    pinned: true,
    seed: {
      company: "Beta Bio",
      price: 2.15,
      priceAtCatalyst: 1.72,
      catalyst: {
        fact: "FDA clearance.",
        sourceName: "GlobeNewswire",
        sourceUrl: "https://example.com/bbbb",
        confirmationLevel: "High (78)",
        ageSec: 2400,
      },
    },
  });
  assert.equal(dossier.identity.pinned, true);
  assert.equal(dossier.verifiedCatalyst.sourceName.value, "GlobeNewswire");
  assert.equal(dossier.actions.sourceUrl, "https://example.com/bbbb");
  assert.ok(
    (dossier.marketMovement.moveSinceCatalystPct.value ?? 0) > 20
  );
});

test("deep link parses symbol param", () => {
  assert.equal(
    symbolFromSearchParams(new URLSearchParams("view=monitor&symbol=aaaa")),
    "AAAA"
  );
  assert.equal(
    symbolFromSearchParams(new URLSearchParams("ticker=BBBB")),
    "BBBB"
  );
  assert.equal(
    symbolFromSearchParams(new URLSearchParams("symbol=!!!")),
    null
  );
  assert.equal(MONITOR_SYMBOL_PARAM, "symbol");
});

test("fixture seeds include rich intel for demo leaders", () => {
  const vm = buildMonitorFixture("live");
  assert.ok(vm.intelSeeds.AAAA);
  assert.equal(vm.intelSeeds.AAAA.priceAtCatalyst, null);
  assert.ok(vm.intelSeeds.BBBB?.priceAtCatalyst != null);
  const a = buildSelectedTicker({
    row: vm.ladder.find((r) => r.symbol === "AAAA")!,
    pinned: false,
    seed: vm.intelSeeds.AAAA,
  });
  assert.equal(a.currentState.tradeability.availability, "ok");
  assert.equal(a.primaryRisks.length, 10);
  assert.ok(a.eventTimeline.length >= 1);
  assert.ok(
    a.evidence.missingOrUncertain.some((m) =>
      (m.value ?? "").toLowerCase().includes("price at catalyst")
    )
  );
});

test("disclaimer forbids trade-advice language", () => {
  const d = buildSelectedTicker({
    row: row({ symbol: "ZZZZ" }),
    pinned: false,
  });
  const text = d.disclaimer.toLowerCase();
  assert.ok(text.includes("not investment advice"));
  assert.ok(text.includes("no buy/sell"));
  assert.ok(text.includes("expected return"));
  assert.ok(text.includes("success probability"));
});
