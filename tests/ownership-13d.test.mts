/**
 * Beneficial ownership (13D/13G) parser + comparison tests.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOwnershipSummary,
  classifyOwnershipChange,
} from "../src/lib/ownership/compare.ts";
import { parseBeneficialOwnershipDocument } from "../src/lib/ownership/parse.ts";
import { mapOwnershipToCompanyEvents } from "../src/lib/ownership/events.ts";
import { shouldExtractOwnership } from "../src/lib/ownership/from-catalyst.ts";
import { isCompanyEventType } from "../src/lib/company-events/types.ts";
import { scoreEventSignificance } from "../src/lib/company-events/significance.ts";
import {
  FIXTURE_13D_AMENDMENT_REDUCTION,
  FIXTURE_13D_INITIAL_HTML,
  FIXTURE_13D_SHARES_ONLY,
  FIXTURE_13D_UNPARSEABLE,
  FIXTURE_13G_AMENDMENT_INCREASE,
  FIXTURE_13G_INITIAL,
} from "./fixtures/schedule-13d.ts";

test("parses initial 13D: filer, %, shares, form", () => {
  const p = parseBeneficialOwnershipDocument(FIXTURE_13D_INITIAL_HTML, {
    formTypeHint: "SC 13D",
  });
  assert.equal(p.parseStatus, "ok");
  assert.equal(p.filerName, "Alpha Capital Partners LLC");
  assert.equal(p.issuerName, "Ownr Corp");
  assert.equal(p.percentOwned, 9.8);
  assert.equal(p.sharesOwned, 12_500_000);
  assert.equal(p.formType, "SC 13D");
  assert.equal(p.isAmendment, false);
  assert.ok(p.confidence >= 0.7);
});

test("parses 13G and amendment form types", () => {
  const g = parseBeneficialOwnershipDocument(FIXTURE_13G_INITIAL);
  assert.equal(g.formType, "SC 13G");
  assert.equal(g.percentOwned, 6.2);
  assert.equal(g.isAmendment, false);

  const a = parseBeneficialOwnershipDocument(FIXTURE_13G_AMENDMENT_INCREASE);
  assert.equal(a.formType, "SC 13G/A");
  assert.equal(a.isAmendment, true);
  assert.equal(a.percentOwned, 8.5);
});

test("unparseable filing does not invent percentage", () => {
  const p = parseBeneficialOwnershipDocument(FIXTURE_13D_UNPARSEABLE, {
    formTypeHint: "SC 13D",
  });
  assert.equal(p.parseStatus, "unparseable");
  assert.equal(p.percentOwned, null);
  assert.equal(p.sharesOwned, null);
});

test("shares-only is partial — no false percent", () => {
  const p = parseBeneficialOwnershipDocument(FIXTURE_13D_SHARES_ONLY);
  assert.equal(p.parseStatus, "partial");
  assert.equal(p.percentOwned, null);
  assert.equal(p.sharesOwned, 1_500_000);
  assert.ok(p.filerName);
});

test("initial material holder → material_new", () => {
  const current = parseBeneficialOwnershipDocument(FIXTURE_13D_INITIAL_HTML, {
    formTypeHint: "SC 13D",
  });
  const c = classifyOwnershipChange({ current, prior: null });
  assert.equal(c.structuredKind, "material_new");
  assert.equal(c.previousPercent, null);
});

test("amendment reduction below 5% → exit_reduction", () => {
  const current = parseBeneficialOwnershipDocument(
    FIXTURE_13D_AMENDMENT_REDUCTION,
    { formTypeHint: "SC 13D/A" }
  );
  const c = classifyOwnershipChange({
    current,
    prior: {
      percentOwned: 9.8,
      sharesOwned: 12_500_000,
      accessionNumber: "0001555000-24-000001",
      filedAt: new Date("2024-01-01"),
    },
  });
  assert.equal(c.structuredKind, "exit_reduction");
  assert.ok(c.percentChange != null && c.percentChange < 0);
  assert.equal(c.previousPercent, 9.8);
});

test("meaningful % increase → pct_change", () => {
  const current = parseBeneficialOwnershipDocument(
    FIXTURE_13G_AMENDMENT_INCREASE
  );
  const c = classifyOwnershipChange({
    current,
    prior: {
      percentOwned: 6.2,
      sharesOwned: 8_000_000,
      accessionNumber: "0001",
      filedAt: new Date("2024-01-01"),
    },
  });
  assert.equal(c.structuredKind, "pct_change");
  assert.ok(c.percentChange != null && c.percentChange >= 1);
});

test("tiny change is not meaningful", () => {
  const current = parseBeneficialOwnershipDocument(FIXTURE_13G_INITIAL);
  // Force amendment + tiny delta
  const amended = { ...current, isAmendment: true, percentOwned: 6.4 };
  const c = classifyOwnershipChange({
    current: amended,
    prior: {
      percentOwned: 6.2,
      sharesOwned: 8_000_000,
      accessionNumber: "0001",
      filedAt: new Date("2024-01-01"),
    },
  });
  assert.equal(c.structuredKind, "none");
});

test("summary uses Beneficial owner reported X% — never smart money", () => {
  const s = buildOwnershipSummary({
    filerName: "Alpha Capital Partners LLC",
    percentOwned: 9.8,
    sharesOwned: 12_500_000,
    formType: "SC 13D",
    isAmendment: false,
    structuredKind: "material_new",
    previousPercent: null,
    percentChange: null,
  });
  assert.match(s, /Beneficial owner reported 9\.8%/i);
  assert.doesNotMatch(s, /smart money|is buying|bullish|\bwhale\b/i);
});

test("maps material_new → Watchtower CompanyEvent", () => {
  const events = mapOwnershipToCompanyEvents({
    symbol: "OWNR",
    accessionNumber: "0001555000-24-000805",
    filedAt: new Date("2024-03-05"),
    formType: "SC 13D",
    filerName: "Alpha Capital Partners LLC",
    percentOwned: 9.8,
    sharesOwned: 12_500_000,
    previousPercent: null,
    percentChange: null,
    structuredKind: "material_new",
    summaryText: "Beneficial owner reported 9.8%",
  });
  assert.equal(events.length, 1);
  assert.equal(events[0]!.eventType, "beneficial_ownership_material_new");
  assert.equal(events[0]!.category, "ownership");
  assert.ok(isCompanyEventType(events[0]!.eventType));
  assert.match(events[0]!.title, /Beneficial owner reported/i);
  assert.doesNotMatch(events[0]!.title, /smart money/i);
});

test("structuredKind none emits no CompanyEvent", () => {
  const events = mapOwnershipToCompanyEvents({
    symbol: "OWNR",
    accessionNumber: "x",
    filedAt: new Date(),
    formType: "SC 13D",
    filerName: "X",
    percentOwned: 3,
    sharesOwned: null,
    previousPercent: null,
    percentChange: null,
    structuredKind: "none",
    summaryText: "Beneficial owner reported 3%",
  });
  assert.equal(events.length, 0);
});

test("shouldExtractOwnership gates SC 13D raw ids", () => {
  assert.equal(
    shouldExtractOwnership({
      source: "SEC EDGAR",
      rawNewsId: "sec-sc-13d-0001555000-2024-03-05T12:00:00Z",
      headline: "Schedule 13D: Beneficial ownership",
    }),
    true
  );
  assert.equal(
    shouldExtractOwnership({
      source: "SEC EDGAR",
      rawNewsId: "sec-8-k-0001",
      headline: "8-K Filing",
    }),
    false
  );
});

test("significance codes for structured ownership events", () => {
  const neu = scoreEventSignificance({
    eventType: "beneficial_ownership_material_new",
    category: "ownership",
  });
  assert.ok(neu.reasonCodes.includes("OWNERSHIP_MATERIAL_NEW"));

  const ch = scoreEventSignificance({
    eventType: "beneficial_ownership_pct_change",
    category: "ownership",
  });
  assert.ok(ch.reasonCodes.includes("OWNERSHIP_PCT_CHANGE"));

  const ex = scoreEventSignificance({
    eventType: "beneficial_ownership_exit",
    category: "ownership",
  });
  assert.ok(ex.reasonCodes.includes("OWNERSHIP_EXIT_REDUCTION"));
});

test("exit summary mentions decrease without motives", () => {
  const s = buildOwnershipSummary({
    filerName: "Alpha Capital Partners LLC",
    percentOwned: 2.1,
    sharesOwned: 3_000_000,
    formType: "SC 13D/A",
    isAmendment: true,
    structuredKind: "exit_reduction",
    previousPercent: 9.8,
    percentChange: -7.7,
  });
  assert.match(s, /decreased from 9\.8% to 2\.1%/i);
  assert.doesNotMatch(s, /giving up|bearish|dumping|smart money/i);
});
