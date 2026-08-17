/**
 * Canonical evidence model — fingerprints, refs, idempotent persist.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { evidenceFingerprint } from "../src/lib/evidence/fingerprint.ts";
import { evidenceFromMetricObservation } from "../src/lib/evidence/from-metric.ts";
import { evidenceFromCompanyEvent } from "../src/lib/evidence/from-company-event.ts";
import { mapEvidenceRow } from "../src/lib/evidence/persist.ts";
import {
  EVIDENCE_AVAILABILITY,
  EVIDENCE_CATEGORIES,
  isEvidenceCategory,
} from "../src/lib/evidence/types.ts";

test("evidence categories and availability enums are stable", () => {
  assert.ok(EVIDENCE_CATEGORIES.includes("sec_xbrl_fact"));
  assert.ok(EVIDENCE_CATEGORIES.includes("external_government"));
  assert.deepEqual(EVIDENCE_AVAILABILITY, [
    "verified",
    "derived",
    "reported",
    "unknown",
  ]);
});

test("evidence fingerprint is stable for linked metric rows", () => {
  const a = evidenceFingerprint({
    symbol: "rklb",
    category: "sec_xbrl_fact",
    sourceType: "sec_companyfacts",
    linkedModel: "metric_observation",
    linkedId: "mo-1",
  });
  const b = evidenceFingerprint({
    symbol: "RKLB",
    category: "sec_xbrl_fact",
    sourceType: "sec_companyfacts",
    linkedModel: "metric_observation",
    linkedId: "mo-1",
  });
  assert.equal(a, b);
  assert.match(a, /RKLB\|sec_xbrl_fact\|metric_observation\|mo-1/);
});

test("metric observation ref uses derived availability when source is derived", () => {
  const input = evidenceFromMetricObservation({
    id: "m1",
    symbol: "RKLB",
    cik: "0001819994",
    metricKey: "gross_margin",
    value: 38.2,
    unit: "percent",
    periodEnd: new Date("2026-03-31T00:00:00.000Z"),
    filedAt: new Date("2026-05-07T00:00:00.000Z"),
    accession: "0001819994-26-000028",
    secConcept: "derived:gross_margin",
    sourceType: "derived",
    sourceUrl: "https://data.sec.gov/api/xbrl/companyfacts/CIK0001819994.json",
  });
  assert.equal(input.availability, "derived");
  assert.equal(input.linkedModel, "metric_observation");
  assert.equal(input.linkedId, "m1");
  assert.equal(input.payload?.metricKey, "gross_margin");
});

test("null metric value maps to unknown availability", () => {
  const input = evidenceFromMetricObservation({
    id: "m2",
    symbol: "AAPL",
    cik: null,
    metricKey: "revenue",
    value: null,
    unit: "USD",
    periodEnd: null,
    filedAt: null,
    accession: null,
    secConcept: null,
    sourceType: "sec_companyfacts",
    sourceUrl: null,
  });
  assert.equal(input.availability, "unknown");
  assert.equal(input.payload?.hasValue, false);
});

test("company event ref maps category to evidence category", () => {
  const input = evidenceFromCompanyEvent({
    id: "e1",
    symbol: "RKLB",
    cik: "0001819994",
    category: "insider",
    eventType: "insider_open_market_purchase",
    sourceType: "sec",
    sourceId: "0001819994-26-000004",
    sourceUrl: "https://www.sec.gov/",
    occurredAt: new Date("2026-03-01T00:00:00.000Z"),
  });
  assert.equal(input.category, "form4");
  assert.equal(input.linkedModel, "company_event");
});

test("mapEvidenceRow normalizes prisma row", () => {
  const dto = mapEvidenceRow({
    id: "ev1",
    symbol: "RKLB",
    cik: "0001819994",
    category: "sec_xbrl_fact",
    sourceType: "sec_companyfacts",
    sourceId: "acc",
    sourceUrl: "https://www.sec.gov/",
    occurredAt: new Date("2026-06-30T00:00:00.000Z"),
    reportedAt: null,
    periodStart: null,
    periodEnd: new Date("2026-06-30T00:00:00.000Z"),
    linkedModel: "metric_observation",
    linkedId: "m1",
    payloadJson: { metricKey: "revenue" },
    availability: "reported",
    fingerprint: "fp1",
    ingestedAt: new Date("2026-08-17T00:00:00.000Z"),
  });
  assert.equal(dto.symbol, "RKLB");
  assert.ok(isEvidenceCategory(dto.category));
  assert.equal(dto.payload.metricKey, "revenue");
});

test("EVIDENCE_MODEL.md documents linked models", () => {
  const doc = readFileSync(
    join(import.meta.dirname, "..", "docs", "EVIDENCE_MODEL.md"),
    "utf8"
  );
  assert.match(doc, /EvidenceRecord/);
  assert.match(doc, /metric_observation/);
  assert.match(doc, /UNKNOWN stays null/i);
});

test("prisma schema includes EvidenceRecord", () => {
  const schema = readFileSync(
    join(import.meta.dirname, "..", "prisma", "schema.prisma"),
    "utf8"
  );
  assert.match(schema, /model EvidenceRecord/);
  assert.match(schema, /fingerprint\s+String\s+@unique/);
});
