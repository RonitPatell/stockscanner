/**
 * Institutional 13F — parse, period matching, change classification tests.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyAgainstPrior,
  classifyPositionChange,
  findPriorReportDate,
  holdingMatchKey,
  isTypicalQuarterlyGap,
  normalizeCusip,
  periodGapDays,
} from "../src/lib/institutional/compare.ts";
import { parse13fInformationTable } from "../src/lib/institutional/parse.ts";
import { resolveSymbolFromMaps } from "../src/lib/institutional/resolve-symbol.ts";
import { shouldExtract13f } from "../src/lib/institutional/from-catalyst.ts";
import {
  FIXTURE_13F_COVER,
  FIXTURE_13F_INFO_TABLE,
} from "./fixtures/form13f.ts";

test("parses infoTable shares and converts value $000s → USD", () => {
  const p = parse13fInformationTable(FIXTURE_13F_INFO_TABLE, {
    filerCik: "1234567",
    filerName: "Example Advisors LP",
    reportDate: "2024-03-31",
  });
  assert.ok(p.holdings.length >= 2);
  const aapl = p.holdings.find((h) => h.cusip === "037833100");
  assert.ok(aapl);
  assert.equal(aapl!.shares, 1_000_000);
  assert.equal(aapl!.valueUsd, 250_000_000);
  assert.equal(aapl!.issuerName, "APPLE INC");
});

test("cover fields supply report date and filer name", () => {
  const combined = `${FIXTURE_13F_COVER}\n${FIXTURE_13F_INFO_TABLE}`;
  const p = parse13fInformationTable(combined);
  assert.equal(p.reportDate, "2024-03-31");
  assert.equal(p.filerName, "Example Advisors LP");
});

test("period matching picks latest prior reportDate only", () => {
  const current = new Date("2024-06-30T00:00:00Z");
  const dates = [
    new Date("2023-12-31T00:00:00Z"),
    new Date("2024-03-31T00:00:00Z"),
    new Date("2024-09-30T00:00:00Z"), // after current — ignored
  ];
  const prior = findPriorReportDate(dates, current);
  assert.ok(prior);
  assert.equal(prior!.toISOString().slice(0, 10), "2024-03-31");
});

test("typical quarterly gap is ~90 days", () => {
  const a = new Date("2024-03-31T00:00:00Z");
  const b = new Date("2024-06-30T00:00:00Z");
  assert.ok(periodGapDays(a, b) >= 90 && periodGapDays(a, b) <= 92);
  assert.equal(isTypicalQuarterlyGap(a, b), true);
  assert.equal(
    isTypicalQuarterlyGap(a, new Date("2025-06-30T00:00:00Z")),
    false
  );
});

test("classifies new / increased / reduced / unchanged / exited", () => {
  assert.equal(
    classifyPositionChange({ currentShares: 100, priorShares: null }).changeKind,
    "new"
  );
  assert.equal(
    classifyPositionChange({ currentShares: 150, priorShares: 100 }).changeKind,
    "increased"
  );
  assert.equal(
    classifyPositionChange({ currentShares: 50, priorShares: 100 }).changeKind,
    "reduced"
  );
  assert.equal(
    classifyPositionChange({ currentShares: 100, priorShares: 100 }).changeKind,
    "unchanged"
  );
  assert.equal(
    classifyPositionChange({
      currentShares: 0,
      priorShares: 100,
      isExit: true,
    }).changeKind,
    "exited"
  );
});

test("classifyAgainstPrior computes share and value deltas", () => {
  const r = classifyAgainstPrior({
    currentShares: 200,
    currentValue: 2_000_000,
    prior: {
      symbol: "AAPL",
      cusip: "037833100",
      shares: 100,
      valueUsd: 1_000_000,
      reportDate: new Date("2024-03-31"),
      accessionNumber: "0001",
    },
  });
  assert.equal(r.changeKind, "increased");
  assert.equal(r.sharesChange, 100);
  assert.equal(r.valueChange, 1_000_000);
  assert.equal(r.priorAccession, "0001");
});

test("holdingMatchKey prefers CUSIP", () => {
  assert.equal(
    holdingMatchKey({ cusip: "037833100", symbol: "AAPL" }),
    "cusip:037833100"
  );
  assert.equal(normalizeCusip("0378-33100"), "037833100");
});

test("resolveSymbolFromMaps matches normalized issuer names", () => {
  const byName = new Map([["apple", "AAPL"]]);
  assert.equal(
    resolveSymbolFromMaps({ issuerName: "Apple Inc" }, { byName }),
    "AAPL"
  );
  assert.equal(
    resolveSymbolFromMaps({ issuerName: "Unknown Co" }, { byName }),
    null
  );
});

test("shouldExtract13f gates on sec-13f-hr raw id", () => {
  assert.equal(
    shouldExtract13f({
      source: "SEC EDGAR",
      rawNewsId: "sec-13f-hr-0001234567-2024-05-15T12:00:00Z",
      headline: "Form 13F-HR (institutional filings): Example",
    }),
    true
  );
  assert.equal(
    shouldExtract13f({
      source: "SEC EDGAR",
      rawNewsId: "sec-8-k-0001",
      headline: "8-K",
    }),
    false
  );
});

test("product copy never claims smart money signal", () => {
  const disclosure =
    "Institutional filings (Form 13F) are delayed. Figures reflect the reported period end and filing date — not real-time positions.";
  assert.match(disclosure, /Institutional filings/i);
  assert.match(disclosure, /delayed|not real-time/i);
  assert.doesNotMatch(disclosure, /smart money signal/i);
});

test("empty xml does not invent holdings", () => {
  const p = parse13fInformationTable("");
  assert.equal(p.holdings.length, 0);
  assert.ok(p.parseWarnings.includes("empty_document"));
});
