/**
 * Decision Drawer — section order, omit-empty formatting, risks, deep-link, live patch.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  DECISION_DRAWER_SECTIONS,
  DECISION_DRAWER_VERSION,
  DRAWER_CATALYST_PARAM,
  catalystIdFromSearchParams,
  confirmationLabel,
  drawerCompactNumber,
  drawerField,
  drawerText,
  drawerTime,
  sortPrimaryRisks,
  stickNumber,
} from "../src/lib/decision-drawer/index.ts";
import {
  patchDecisionCardLive,
  projectDecisionCardV3,
} from "../src/lib/decision-card/index.ts";
import {
  DASHBOARD_GUIDE_STEPS,
  PLATFORM_GUIDE_VERSION,
} from "../src/lib/platform-guide.ts";
import type { DecisionRiskFlag } from "../src/lib/decision-card/types.ts";
import type { CatalystItem } from "../src/types/index.ts";

function item(
  over: Partial<CatalystItem> & Pick<CatalystItem, "id" | "symbol">
): CatalystItem {
  return {
    headline: "Company announces registered direct offering",
    source: "SEC EDGAR",
    publishedAt: "2026-07-27T14:00:00.000Z",
    ingestedAt: "2026-07-27T14:00:05.000Z",
    urgencyScore: 70,
    verifiedConfidence: 80,
    changePercent: 12,
    price: null,
    volume: null,
    rVol: null,
    floatShares: null,
    ...over,
  };
}

test("decision drawer version + fixed section order", () => {
  assert.match(DECISION_DRAWER_VERSION, /decision-drawer/);
  assert.deepEqual([...DECISION_DRAWER_SECTIONS], [
    "event",
    "reaction",
    "tradeability",
    "primary-risks",
    "evidence",
    "optional-analysis",
  ]);
  // Analogues must not sit above tradeability / risks
  const opt = DECISION_DRAWER_SECTIONS.indexOf("optional-analysis");
  const trade = DECISION_DRAWER_SECTIONS.indexOf("tradeability");
  const risks = DECISION_DRAWER_SECTIONS.indexOf("primary-risks");
  assert.ok(opt > trade && opt > risks);
});

test("platform guide documents Decision Drawer (v30+)", () => {
  assert.ok(PLATFORM_GUIDE_VERSION >= 30);
  const step = DASHBOARD_GUIDE_STEPS.find((s) => s.id === "context-drawer");
  assert.ok(step);
  assert.match(step!.body, /Event.*Reaction.*Tradeability/i);
  assert.match(step!.body, /cid/);
  assert.match(step!.body, /sticky/i);
  assert.ok(!/Unavailable fields say Unavailable/i.test(step!.body));
});

test("drawerField / drawerText omit empty instead of Unavailable", () => {
  assert.equal(drawerField(null), null);
  assert.equal(
    drawerField({ value: null, availability: "unavailable" }),
    null
  );
  assert.equal(
    drawerField({ value: 1.234, availability: "ok" }, { prefix: "$", digits: 2 }),
    "$1.23"
  );
  assert.equal(
    drawerField(
      { value: 1.234, availability: "estimated" },
      { prefix: "$", digits: 2 }
    ),
    "$1.23 (est.)"
  );
  assert.equal(drawerText(""), null);
  assert.equal(drawerText(null), null);
  assert.equal(drawerText("  Wire  "), "Wire");
  assert.equal(drawerTime(null), null);
  assert.equal(drawerTime("not-a-date"), null);
  assert.equal(
    confirmationLabel({ value: null, availability: "unavailable" }),
    null
  );
  assert.match(confirmationLabel({ value: 72, availability: "ok" })!, /High/);
  assert.equal(drawerCompactNumber(2_500_000, { prefix: "$" }), "$2.50M");
});

test("stickNumber keeps last known value when next is empty", () => {
  const kept = stickNumber(
    { value: 3.21, availability: "ok" },
    { value: null, availability: "unavailable" }
  );
  assert.equal(kept.value, 3.21);
  assert.equal(kept.availability, "stale");
  const fresh = stickNumber(
    { value: 3.21, availability: "stale" },
    { value: 3.5, availability: "ok" }
  );
  assert.equal(fresh.value, 3.5);
  assert.equal(fresh.availability, "ok");
});

test("sortPrimaryRisks: active only, severity then category priority", () => {
  const risks: DecisionRiskFlag[] = [
    {
      id: "stale_news",
      label: "Stale",
      severity: "low",
      active: true,
      detail: "old",
    },
    {
      id: "registered_offering",
      label: "Offering",
      severity: "high",
      active: true,
      detail: "RD",
    },
    {
      id: "wide_spread",
      label: "Wide",
      severity: "medium",
      active: true,
      detail: "bps",
    },
    {
      id: "warrants",
      label: "Warrants",
      severity: "high",
      active: false,
      detail: "off",
    },
  ];
  const sorted = sortPrimaryRisks(risks);
  assert.equal(sorted.length, 3);
  assert.equal(sorted[0]!.id, "registered_offering");
  assert.ok(sorted.every((r) => r.active));
  assert.ok(!sorted.some((r) => r.id === "warrants"));
});

test("deep-link helpers read cid / catalystId / catalyst", () => {
  assert.equal(DRAWER_CATALYST_PARAM, "cid");
  assert.equal(
    catalystIdFromSearchParams(new URLSearchParams("cid=abc-123")),
    "abc-123"
  );
  assert.equal(
    catalystIdFromSearchParams(new URLSearchParams("catalystId=xyz")),
    "xyz"
  );
  assert.equal(
    catalystIdFromSearchParams(new URLSearchParams("catalyst=legacy")),
    "legacy"
  );
  assert.equal(catalystIdFromSearchParams(new URLSearchParams("")), null);
});

test("live patch updates current price without inventing spread", () => {
  const c = item({ id: "live-1", symbol: "ABCD" });
  const base = projectDecisionCardV3(c, { nowMs: Date.now() });
  assert.equal(base.reaction.currentPrice.availability, "unavailable");
  assert.equal(base.tradeability.spreadDollars.availability, "unavailable");

  const patched = patchDecisionCardLive(base, {
    price: 2.45,
    changePercent: 8.1,
    volume: 1_000_000,
    rVol: 4.2,
  });
  assert.equal(patched.reaction.currentPrice.availability, "ok");
  assert.equal(patched.reaction.currentPrice.value, 2.45);
  // Spread still unavailable — never silently filled
  assert.equal(patched.tradeability.spreadDollars.availability, "unavailable");
  assert.equal(patched.catalystId, "live-1");
});

test("session price + % fill publication mark as estimated (not blank)", () => {
  const c = item({
    id: "est-1",
    symbol: "WXYZ",
    price: 2.24,
    changePercent: 12,
    volume: 3_000_000,
    rVol: 5.5,
  });
  const card = projectDecisionCardV3(c, { nowMs: Date.now() });
  assert.equal(card.reaction.currentPrice.availability, "ok");
  assert.equal(card.reaction.priceAtPublication.availability, "estimated");
  assert.ok(card.reaction.priceAtPublication.value != null);
  assert.ok(card.reaction.moveSincePublicationPct.value != null);
  assert.equal(card.reaction.relativeVolume.availability, "ok");
  assert.equal(card.tradeability.dollarVolume.availability, "ok");
});

test("optional analysis stays last in DOM section ids", () => {
  const order = [...DECISION_DRAWER_SECTIONS];
  assert.equal(order[order.length - 1], "optional-analysis");
  assert.ok(order.indexOf("event") === 0);
});
