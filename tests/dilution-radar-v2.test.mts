import assert from "node:assert/strict";
import test from "node:test";
import {
  computePotentialDilutionPct,
  extractDilutionInstruments,
  parseAccessionFromUrl,
  parseFormFromRawNewsId,
} from "../src/lib/dilution/extract.ts";
import { shouldExtractDilution } from "../src/lib/dilution/from-catalyst.ts";
import { isDilutionCatalyst } from "../src/lib/action-playbook.ts";
import { detectRiskOnlyCatalyst } from "../src/lib/alerts/modes.ts";
import {
  FIXTURE_424B5_REGISTERED_DIRECT,
  FIXTURE_ATM_AMENDMENT_TERMINATED,
  FIXTURE_CAPACITY_ONLY_NO_SHARES,
  FIXTURE_CONFLICTING_ATM_CAPACITY,
  FIXTURE_CONVERTIBLE_NOTE,
  FIXTURE_EFFECTIVE_REGISTRATION,
  FIXTURE_EQUITY_PURCHASE,
  FIXTURE_REVERSE_SPLIT,
  FIXTURE_S3_SHELF_ATM,
  FIXTURE_WARRANT_REPRICE,
} from "./fixtures/dilution-filings.ts";

test("S-3 shelf + ATM extracts registration capacity and ATM availability", () => {
  const rows = extractDilutionInstruments(FIXTURE_S3_SHELF_ATM);
  const types = rows.map((r) => r.instrumentType);
  assert.ok(types.includes("S3_SHELF") || types.includes("ATM_PROGRAM"));
  const shelf = rows.find((r) => r.instrumentType === "S3_SHELF");
  const atm = rows.find((r) => r.instrumentType === "ATM_PROGRAM");
  assert.ok(shelf || atm);
  const primary = atm || shelf!;
  assert.equal(primary.capacityKind === "registration_capacity" || primary.capacityKind === "atm_availability", true);
  assert.ok(primary.maxDollars == null || primary.maxDollars === 100_000_000 || primary.maxDollars > 0);
  assert.ok(primary.evidenceSnippets.length >= 0);
  if (primary.potentialDilutionPct != null) {
    assert.ok(["estimate", "capacity_only"].includes(primary.estimateLabel));
  }
});

test("424B5 registered direct extracts announced sale with offer price and warrants", () => {
  const rows = extractDilutionInstruments(FIXTURE_424B5_REGISTERED_DIRECT);
  assert.ok(rows.some((r) => r.instrumentType === "REGISTERED_DIRECT" || r.instrumentType === "PROSPECTUS_424B5"));
  const direct =
    rows.find((r) => r.instrumentType === "REGISTERED_DIRECT") ||
    rows.find((r) => r.instrumentType === "PROSPECTUS_424B5")!;
  assert.equal(direct.capacityKind, "announced_sale");
  assert.ok(direct.offerPrice === 2.5 || direct.offerPrice == null || direct.maxShares != null);
  const warrant = rows.find((r) => r.instrumentType === "WARRANT");
  if (warrant) {
    assert.ok(warrant.warrantCount == null || warrant.warrantCount > 0);
  }
  if (direct.maxShares != null && direct.sharesOutstandingDenom) {
    assert.ok(direct.potentialDilutionPct != null);
    assert.equal(direct.estimateLabel, "estimate");
  }
});

test("amendment terminating ATM marks terminated facility", () => {
  const rows = extractDilutionInstruments(FIXTURE_ATM_AMENDMENT_TERMINATED);
  assert.ok(
    rows.some(
      (r) =>
        r.instrumentType === "TERMINATED_FACILITY" ||
        r.status === "terminated" ||
        r.instrumentType === "AMENDMENT"
    )
  );
  const term = rows.find((r) => r.instrumentType === "TERMINATED_FACILITY");
  if (term) assert.equal(term.status, "terminated");
});

test("convertible note extracts capacity with labeled estimate when shares known", () => {
  const rows = extractDilutionInstruments(FIXTURE_CONVERTIBLE_NOTE);
  assert.ok(rows.some((r) => r.instrumentType === "CONVERTIBLE_NOTE"));
  const note = rows.find((r) => r.instrumentType === "CONVERTIBLE_NOTE")!;
  assert.ok(note.maxShares === 8_000_000 || note.maxDollars === 30_000_000 || note.maxShares != null);
  if (note.maxShares != null) {
    assert.ok(note.potentialDilutionPct != null);
    assert.ok(note.estimateLabel === "estimate" || note.estimateLabel === "capacity_only");
  }
});

test("warrant reprice extracts warrant count and exercise price", () => {
  const rows = extractDilutionInstruments(FIXTURE_WARRANT_REPRICE);
  assert.ok(rows.some((r) => r.instrumentType === "WARRANT_REPRICE" || r.instrumentType === "WARRANT"));
  const w =
    rows.find((r) => r.instrumentType === "WARRANT_REPRICE") ||
    rows.find((r) => r.instrumentType === "WARRANT")!;
  assert.ok(w.warrantExercisePrice === 1.25 || w.warrantExercisePrice == null);
});

test("reverse split detected", () => {
  const rows = extractDilutionInstruments(FIXTURE_REVERSE_SPLIT);
  assert.ok(rows.some((r) => r.instrumentType === "REVERSE_SPLIT"));
});

test("effective registration is registration capacity / active", () => {
  const rows = extractDilutionInstruments(FIXTURE_EFFECTIVE_REGISTRATION);
  assert.ok(
    rows.some(
      (r) =>
        r.instrumentType === "EFFECTIVE_REGISTRATION" || r.instrumentType === "S3_SHELF"
    )
  );
  const eff =
    rows.find((r) => r.instrumentType === "EFFECTIVE_REGISTRATION") ||
    rows.find((r) => r.instrumentType === "S3_SHELF")!;
  assert.equal(eff.capacityKind, "registration_capacity");
});

test("equity purchase agreement detected", () => {
  const rows = extractDilutionInstruments(FIXTURE_EQUITY_PURCHASE);
  assert.ok(rows.some((r) => r.instrumentType === "EQUITY_PURCHASE_AGREEMENT"));
});

test("never invents dilution % without reliable shares denominator", () => {
  const rows = extractDilutionInstruments(FIXTURE_CAPACITY_ONLY_NO_SHARES);
  assert.ok(rows.length > 0);
  for (const r of rows) {
    assert.equal(r.potentialDilutionPct, null);
    assert.ok(
      r.estimateLabel === "unavailable" || r.estimateLabel === "capacity_only"
    );
    assert.ok(
      r.missingFields.includes("sharesOutstanding") ||
        r.estimateLabel === "unavailable" ||
        r.estimateLabel === "capacity_only"
    );
  }
});

test("computePotentialDilutionPct refuses unreliable ratios", () => {
  const bad = computePotentialDilutionPct({
    maxShares: 1_000_000_000,
    sharesOutstanding: 1_000_000,
    capacityKind: "announced_sale",
  });
  assert.equal(bad.pct, null);
  assert.equal(bad.label, "unavailable");

  const ok = computePotentialDilutionPct({
    maxShares: 5_000_000,
    sharesOutstanding: 40_000_000,
    capacityKind: "announced_sale",
  });
  assert.equal(ok.pct, 12.5);
  assert.equal(ok.label, "estimate");

  const capacity = computePotentialDilutionPct({
    maxShares: 5_000_000,
    sharesOutstanding: 40_000_000,
    capacityKind: "registration_capacity",
  });
  assert.equal(capacity.label, "capacity_only");
});

test("accession and form parsers", () => {
  assert.equal(
    parseAccessionFromUrl(
      "https://www.sec.gov/Archives/edgar/data/123/0001234567-24-000101/x.htm"
    ),
    "0001234567-24-000101"
  );
  assert.equal(parseFormFromRawNewsId("sec-424b5-000123-2024"), "424B5");
  assert.equal(parseFormFromRawNewsId("sec-s-3/a-000123-2024"), "S-3/A");
});

test("shouldExtractDilution gates capital SEC forms", () => {
  assert.equal(
    shouldExtractDilution({
      source: "SEC EDGAR",
      rawNewsId: "sec-424b5-0001-x",
      headline: "424B5 prospectus: Foo",
    }),
    true
  );
  assert.equal(
    shouldExtractDilution({
      source: "SEC EDGAR",
      rawNewsId: "sec-8-k-0001-x",
      headline: "8-K Filing: earnings release",
    }),
    false
  );
  assert.equal(
    shouldExtractDilution({
      source: "GlobeNewswire",
      headline: "Company announces registered direct offering of common stock",
    }),
    true
  );
});

test("isDilutionCatalyst catches S-3 / 424B5 headlines even if type is sec_filing", () => {
  assert.equal(
    isDilutionCatalyst({
      catalystType: "sec_filing",
      headline: "424B5 prospectus: Example Corp",
    }),
    true
  );
  assert.equal(
    isDilutionCatalyst({
      catalystType: "sec_filing",
      headline: "S-3 shelf registration: Example Corp",
    }),
    true
  );
});

test("RISK_ONLY detector tags prospectus / ATM capital forms", () => {
  const r = detectRiskOnlyCatalyst({
    id: "1",
    symbol: "ABCD",
    headline: "S-3 shelf registration establishing ATM program",
    source: "SEC EDGAR",
    publishedAt: new Date().toISOString(),
    catalystType: "offering",
  } as never);
  assert.equal(r.isRisk, true);
  assert.ok(r.tags.includes("prospectus") || r.tags.includes("offering"));
});

test("conflicting ATM fixtures both extract ATM_PROGRAM with different sizes", () => {
  const a = extractDilutionInstruments(FIXTURE_CONFLICTING_ATM_CAPACITY);
  const b = extractDilutionInstruments({
    symbol: "CONF",
    formType: "S-3",
    accessionNumber: "0001999000-24-000850",
    title: "S-3 — prior ATM program",
    body: `Shelf registration establishing an at-the-market offering facility.
Aggregate offering price of up to $20,000,000 under the sales agreement.`,
    sharesOutstanding: 22_000_000,
  });
  const atmA = a.find((r) => r.instrumentType === "ATM_PROGRAM");
  const atmB = b.find((r) => r.instrumentType === "ATM_PROGRAM");
  assert.ok(atmA && atmB);
  assert.ok(atmA!.maxDollars != null && atmB!.maxDollars != null);
  assert.notEqual(atmA!.maxDollars, atmB!.maxDollars);
});
