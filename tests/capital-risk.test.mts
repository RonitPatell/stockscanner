/**
 * Capital Risk engine — deterministic levels, reason codes, runway UNKNOWN rules.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateCapitalRisk,
  buildCapitalRiskFromInstruments,
} from "../src/lib/capital-risk/evaluate.ts";
import {
  estimateOperatingBurn,
  estimateRunwayQuarters,
  buildLiquidityBlock,
} from "../src/lib/capital-risk/liquidity.ts";
import { buildShareStructureBlock } from "../src/lib/capital-risk/share-structure.ts";
import { capitalRiskStatusLabel } from "../src/lib/capital-risk/types.ts";

test("status labels never say will dilute", () => {
  for (const s of ["low", "moderate", "elevated", "unknown"] as const) {
    const label = capitalRiskStatusLabel(s);
    assert.match(label, /capital risk/i);
    assert.doesNotMatch(label, /will dilute|guaranteed|crush/i);
  }
});

test("active ATM → elevated with ACTIVE_ATM reason", () => {
  const r = evaluateCapitalRisk({
    symbol: "TEST",
    instruments: [
      {
        id: "1",
        instrumentType: "ATM_PROGRAM",
        status: "active",
        potentialDilutionPct: 12,
        estimateLabel: "capacity_only",
        formType: "424B5",
        filingDate: new Date("2024-06-01"),
        sourceUrl: "https://example.com/a",
        accessionNumber: "0001",
        capacityKind: "atm_availability",
        confidence: 0.8,
        cik: "1",
      },
    ],
    observations: [],
  });
  assert.equal(r.status, "elevated");
  assert.ok(r.reasonCodes.includes("ACTIVE_ATM"));
  assert.ok(r.reasons.length >= 1);
  assert.doesNotMatch(r.summary, /will dilute/i);
  assert.match(r.statusLabel, /Elevated capital risk/);
});

test("active S-3 shelf alone → moderate", () => {
  const r = evaluateCapitalRisk({
    symbol: "TEST",
    instruments: [
      {
        id: "1",
        instrumentType: "S3_SHELF",
        status: "active",
        potentialDilutionPct: null,
        estimateLabel: "capacity_only",
        formType: "S-3",
        filingDate: new Date("2024-06-01"),
        sourceUrl: null,
        accessionNumber: "0002",
        capacityKind: "registration_capacity",
        confidence: 0.9,
      },
    ],
    observations: [],
  });
  assert.equal(r.status, "moderate");
  assert.ok(r.reasonCodes.includes("ACTIVE_S3_SHELF"));
});

test("no instruments + no metrics → unknown DATA_SPARSE", () => {
  const r = evaluateCapitalRisk({
    symbol: "EMPTY",
    instruments: [],
    observations: [],
  });
  assert.equal(r.status, "unknown");
  assert.ok(r.reasonCodes.includes("DATA_SPARSE") || r.reasonCodes.includes("NO_INSTRUMENT_COVERAGE"));
  assert.ok(r.reasonCodes.length >= 1);
});

test("terminated instruments only → low", () => {
  const r = evaluateCapitalRisk({
    symbol: "TEST",
    instruments: [
      {
        id: "1",
        instrumentType: "ATM_PROGRAM",
        status: "terminated",
        potentialDilutionPct: null,
        estimateLabel: "unavailable",
        formType: null,
        filingDate: new Date("2023-01-01"),
        sourceUrl: null,
        accessionNumber: "x",
        capacityKind: "other",
        confidence: 0.5,
      },
    ],
    observations: [
      {
        metricKey: "shares_outstanding",
        value: 100,
        periodEnd: new Date("2024-06-30"),
        periodStart: null,
        fiscalYear: 2024,
        fiscalPeriod: "Q3",
        sourceUrl: null,
        filedAt: null,
        fingerprint: "a",
      },
    ],
  });
  assert.equal(r.status, "low");
  assert.ok(r.reasonCodes.includes("NO_ACTIVE_FINANCING_INSTRUMENTS"));
});

test("share YoY >= 25% → elevated", () => {
  const r = evaluateCapitalRisk({
    symbol: "TEST",
    instruments: [],
    observations: [
      {
        metricKey: "shares_outstanding",
        value: 130,
        periodEnd: new Date("2024-06-30"),
        periodStart: null,
        fiscalYear: 2024,
        fiscalPeriod: "Q3",
        sourceUrl: "https://example.com/s",
        filedAt: null,
        fingerprint: "cur",
      },
      {
        metricKey: "shares_outstanding",
        value: 100,
        periodEnd: new Date("2023-06-30"),
        periodStart: null,
        fiscalYear: 2023,
        fiscalPeriod: "Q3",
        sourceUrl: null,
        filedAt: null,
        fingerprint: "prior",
      },
    ],
  });
  assert.equal(r.status, "elevated");
  assert.ok(r.reasonCodes.includes("SHARE_COUNT_YOY_ELEVATED"));
  assert.ok(r.shareStructure.yoyChangePercent != null);
  assert.ok(Math.abs(r.shareStructure.yoyChangePercent! - 30) < 0.01);
});

test("share YoY 10–25% → moderate", () => {
  const r = evaluateCapitalRisk({
    symbol: "TEST",
    instruments: [],
    observations: [
      {
        metricKey: "shares_outstanding",
        value: 112,
        periodEnd: new Date("2024-06-30"),
        periodStart: null,
        fiscalYear: 2024,
        fiscalPeriod: "Q3",
        sourceUrl: null,
        filedAt: null,
        fingerprint: "cur",
      },
      {
        metricKey: "shares_outstanding",
        value: 100,
        periodEnd: new Date("2023-06-30"),
        periodStart: null,
        fiscalYear: 2023,
        fiscalPeriod: "Q3",
        sourceUrl: null,
        filedAt: null,
        fingerprint: "prior",
      },
    ],
  });
  assert.equal(r.status, "moderate");
  assert.ok(r.reasonCodes.includes("SHARE_COUNT_YOY_MODERATE"));
});

test("burn positive OCF → not_applicable runway unknown path", () => {
  const burn = estimateOperatingBurn(5_000_000);
  assert.equal(burn.status, "not_applicable");
  assert.equal(burn.burn, null);
  const runway = estimateRunwayQuarters(20_000_000, burn.burn);
  assert.equal(runway.status, "unknown");
});

test("missing OCF → burn unknown; runway unknown", () => {
  const burn = estimateOperatingBurn(null);
  assert.equal(burn.status, "unknown");
  const block = buildLiquidityBlock([
    {
      metricKey: "cash",
      value: 10_000_000,
      periodEnd: new Date("2024-06-30"),
      periodStart: null,
      fiscalPeriod: null,
      sourceUrl: null,
      filedAt: null,
    },
  ]);
  assert.equal(block.runwayStatus, "unknown");
  assert.equal(block.runwayQuarters, null);
});

test("defensible runway: cash / |negative OCF|", () => {
  const burn = estimateOperatingBurn(-2_000_000);
  assert.equal(burn.status, "burn");
  assert.equal(burn.burn, 2_000_000);
  const runway = estimateRunwayQuarters(10_000_000, burn.burn);
  assert.equal(runway.status, "adequate");
  assert.equal(runway.quarters, 5);

  const short = estimateRunwayQuarters(4_000_000, 2_000_000);
  assert.equal(short.status, "short");
  assert.equal(short.quarters, 2);
});

test("short runway contributes moderate reason", () => {
  const r = evaluateCapitalRisk({
    symbol: "TEST",
    instruments: [],
    observations: [
      {
        metricKey: "cash",
        value: 3_000_000,
        periodEnd: new Date("2024-06-30"),
        periodStart: null,
        fiscalYear: 2024,
        fiscalPeriod: "Q3",
        sourceUrl: null,
        filedAt: null,
        fingerprint: "c",
      },
      {
        metricKey: "operating_cash_flow",
        value: -2_000_000,
        periodEnd: new Date("2024-06-30"),
        periodStart: new Date("2024-04-01"),
        fiscalYear: 2024,
        fiscalPeriod: "Q3",
        sourceUrl: null,
        filedAt: null,
        fingerprint: "o",
      },
      {
        metricKey: "shares_outstanding",
        value: 50,
        periodEnd: new Date("2024-06-30"),
        periodStart: null,
        fiscalYear: 2024,
        fiscalPeriod: "Q3",
        sourceUrl: null,
        filedAt: null,
        fingerprint: "s",
      },
    ],
  });
  assert.ok(r.reasonCodes.includes("RUNWAY_SHORT"));
  assert.ok(["moderate", "elevated"].includes(r.status));
});

test("recent reverse split → elevated", () => {
  const r = evaluateCapitalRisk({
    symbol: "TEST",
    asOf: new Date("2024-12-01"),
    instruments: [
      {
        id: "rs",
        instrumentType: "REVERSE_SPLIT",
        status: "unknown",
        potentialDilutionPct: null,
        estimateLabel: "unavailable",
        formType: "8-K",
        filingDate: new Date("2024-08-01"),
        sourceUrl: null,
        accessionNumber: "rs1",
        capacityKind: "other",
        confidence: 0.7,
      },
    ],
    observations: [],
  });
  assert.equal(r.status, "elevated");
  assert.ok(r.reasonCodes.includes("RECENT_REVERSE_SPLIT"));
});

test("convertible + 424B5 financing events listed", () => {
  const r = evaluateCapitalRisk({
    symbol: "TEST",
    instruments: [
      {
        id: "c",
        instrumentType: "CONVERTIBLE_NOTE",
        status: "active",
        potentialDilutionPct: null,
        estimateLabel: "capacity_only",
        formType: "8-K",
        filingDate: new Date("2024-05-01"),
        sourceUrl: "https://example.com/c",
        accessionNumber: "c1",
        capacityKind: "other",
        confidence: 0.8,
      },
      {
        id: "p",
        instrumentType: "PROSPECTUS_424B5",
        status: "active",
        potentialDilutionPct: null,
        estimateLabel: "capacity_only",
        formType: "424B5",
        filingDate: new Date("2024-04-01"),
        sourceUrl: null,
        accessionNumber: "p1",
        capacityKind: "registration_capacity",
        confidence: 0.8,
      },
    ],
    observations: [],
  });
  assert.equal(r.status, "elevated");
  assert.ok(r.reasonCodes.includes("ACTIVE_CONVERTIBLE"));
  assert.ok(r.financingEvents.some((e) => e.instrumentType === "CONVERTIBLE_NOTE"));
  assert.ok(r.financingEvents.some((e) => e.formHint === "424B5"));
});

test("every evaluation includes reason codes", () => {
  const cases = [
    evaluateCapitalRisk({ symbol: "A", instruments: [], observations: [] }),
    evaluateCapitalRisk({
      symbol: "B",
      instruments: [
        {
          id: "1",
          instrumentType: "EFFECTIVE_REGISTRATION",
          status: "active",
          potentialDilutionPct: null,
          estimateLabel: "capacity_only",
          formType: "EFFECT",
          filingDate: new Date(),
          sourceUrl: null,
          accessionNumber: "e",
          capacityKind: "other",
          confidence: 0.6,
        },
      ],
      observations: [],
    }),
  ];
  for (const r of cases) {
    assert.ok(r.reasonCodes.length >= 1);
    assert.equal(r.reasonCodes.length, r.reasons.length);
  }
});

test("legacy buildCapitalRiskFromInstruments ATM still elevated", () => {
  const build = buildCapitalRiskFromInstruments({
    symbol: "TEST",
    instruments: [
      {
        id: "i1",
        instrumentType: "ATM_PROGRAM",
        status: "active",
        potentialDilutionPct: 12,
        estimateLabel: "capacity_only",
        formType: "424B5",
        cik: "1",
      },
    ],
  });
  assert.equal(build.status, "elevated");
  assert.ok(build.summary.includes("not a confirmed sale") || build.summary.includes("capital risk"));
});

test("share structure multi-year when observations span ~3y", () => {
  const block = buildShareStructureBlock([
    {
      metricKey: "shares_outstanding",
      value: 200,
      periodEnd: new Date("2024-06-30"),
      fiscalYear: 2024,
      fiscalPeriod: "Q3",
      sourceUrl: null,
      fingerprint: "n",
    },
    {
      metricKey: "shares_outstanding",
      value: 100,
      periodEnd: new Date("2021-06-30"),
      fiscalYear: 2021,
      fiscalPeriod: "Q3",
      sourceUrl: null,
      fingerprint: "o",
    },
  ]);
  assert.ok(block.multiYearChangePercent != null);
  assert.ok(Math.abs(block.multiYearChangePercent! - 100) < 0.01);
});

test("zero cash burn denominator stays unknown", () => {
  const runway = estimateRunwayQuarters(5_000_000, 0);
  assert.equal(runway.status, "unknown");
  assert.equal(runway.quarters, null);
});
