/**
 * Deterministic Company Event Engine — fixture classification + capital mapping.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyFilingDisclosure,
  shouldClassifyCompanyEvent,
} from "../src/lib/company-events/classify.ts";
import { mapDilutionToCompanyEvents } from "../src/lib/company-events/capital-map.ts";
import {
  CAPITAL_EVENT_MIN_CONFIDENCE,
  filingEventFingerprint,
  isCompanyEventType,
} from "../src/lib/company-events/types.ts";
import {
  FORM_BASE_MAP,
  resolveSecForm,
  SUPPORTED_SEC_FORMS,
} from "../src/lib/company-events/forms.ts";
import { extractDilutionInstruments } from "../src/lib/dilution/extract.ts";
import {
  FIXTURE_S3_SHELF_ATM,
  FIXTURE_424B5_REGISTERED_DIRECT,
  FIXTURE_CONVERTIBLE_NOTE,
  FIXTURE_WARRANT_REPRICE,
  FIXTURE_REVERSE_SPLIT,
} from "./fixtures/dilution-filings.ts";
import {
  FIXTURE_8K_AUDITOR,
  FIXTURE_8K_RESULTS,
  FIXTURE_8K_GENERIC,
  FIXTURE_FORM4,
  FIXTURE_13D,
  FIXTURE_NT_10Q,
  FIXTURE_10K,
} from "./fixtures/company-events.ts";

test("supported forms cover required V2 filing set", () => {
  for (const form of [
    "8-K",
    "10-Q",
    "10-K",
    "NT 10-Q",
    "NT 10-K",
    "S-1",
    "S-1/A",
    "S-3",
    "S-3/A",
    "424B5",
    "EFFECT",
    "DEF 14A",
    "3",
    "4",
    "5",
    "144",
    "SC 13D",
    "SC 13D/A",
    "SC 13G",
    "SC 13G/A",
  ]) {
    assert.ok(
      (SUPPORTED_SEC_FORMS as readonly string[]).includes(form),
      `missing ${form}`
    );
    assert.ok(resolveSecForm({ formType: form }));
  }
  assert.equal(FORM_BASE_MAP.length, SUPPORTED_SEC_FORMS.length);
});

test("8-K auditor change emits form + item events with evidence", () => {
  const events = classifyFilingDisclosure(FIXTURE_8K_AUDITOR);
  const types = events.map((e) => e.eventType);
  assert.ok(types.includes("sec_8k"));
  assert.ok(types.includes("auditor_change"));
  const item = events.find((e) => e.eventType === "auditor_change")!;
  assert.equal(item.category, "governance");
  assert.ok(item.confidence >= 0.8);
  assert.equal(
    (item.evidenceJson as { match?: string }).match,
    "eight_k_item"
  );
  assert.ok(
    String((item.evidenceJson as { evidenceSnippet?: string }).evidenceSnippet)
      .length > 0
  );
});

test("8-K results item classified; generic 8-K has no invented items", () => {
  const results = classifyFilingDisclosure(FIXTURE_8K_RESULTS);
  assert.ok(results.some((e) => e.eventType === "financial_results_8k"));

  const generic = classifyFilingDisclosure(FIXTURE_8K_GENERIC);
  assert.ok(generic.some((e) => e.eventType === "sec_8k"));
  assert.equal(
    generic.filter((e) => e.eventType === "auditor_change").length,
    0
  );
  assert.equal(
    generic.filter((e) => e.eventType === "management_change").length,
    0
  );
});

test("Form 4 / 13D / NT 10-Q / 10-K map to taxonomy", () => {
  const f4 = classifyFilingDisclosure(FIXTURE_FORM4);
  assert.ok(f4.some((e) => e.eventType === "sec_form4"));
  assert.ok(f4.some((e) => e.eventType === "insider_form4"));

  const d = classifyFilingDisclosure(FIXTURE_13D);
  assert.ok(d.some((e) => e.eventType === "sec_13d"));
  assert.ok(d.some((e) => e.eventType === "beneficial_ownership_13d"));

  const nt = classifyFilingDisclosure(FIXTURE_NT_10Q);
  assert.ok(nt.some((e) => e.eventType === "sec_nt_10q"));
  assert.equal(nt[0]!.severity, "material");

  const k = classifyFilingDisclosure(FIXTURE_10K);
  assert.ok(k.some((e) => e.eventType === "sec_10k"));
});

test("reprocessing same filing yields identical fingerprints", () => {
  const a = classifyFilingDisclosure(FIXTURE_8K_AUDITOR);
  const b = classifyFilingDisclosure(FIXTURE_8K_AUDITOR);
  assert.deepEqual(
    a.map((e) => e.fingerprint).sort(),
    b.map((e) => e.fingerprint).sort()
  );
});

test("insufficient form confidence uses sec_other only when SEC-like", () => {
  const events = classifyFilingDisclosure({
    symbol: "ZZZZ",
    title: "Random blog post about markets",
    summary: "Opinion piece",
  });
  assert.equal(events.length, 0);

  const secish = classifyFilingDisclosure({
    symbol: "ZZZZ",
    title: "Unknown SEC EDGAR filing",
    rawNewsId: "sec-unknown-0001-2024",
  });
  assert.equal(secish.length, 1);
  assert.equal(secish[0]!.eventType, "sec_other");
  assert.ok(secish[0]!.confidence < 0.5);
});

test("shouldClassifyCompanyEvent gates non-SEC sources", () => {
  assert.equal(
    shouldClassifyCompanyEvent({ source: "Benzinga", headline: "Foo" }),
    false
  );
  assert.equal(
    shouldClassifyCompanyEvent({
      source: "SEC EDGAR",
      rawNewsId: "sec-8-k-x",
    }),
    true
  );
});

test("capital events from dilution fixtures when confident", () => {
  const shelf = extractDilutionInstruments(FIXTURE_S3_SHELF_ATM);
  const shelfEvents = mapDilutionToCompanyEvents({
    symbol: FIXTURE_S3_SHELF_ATM.symbol,
    accessionNumber: FIXTURE_S3_SHELF_ATM.accessionNumber,
    formType: FIXTURE_S3_SHELF_ATM.formType,
    extracted: shelf,
  });
  assert.ok(shelfEvents.some((e) => e.eventType === "shelf_registration"));
  assert.ok(shelfEvents.some((e) => e.eventType === "atm_program"));

  const rd = extractDilutionInstruments(FIXTURE_424B5_REGISTERED_DIRECT);
  const rdEvents = mapDilutionToCompanyEvents({
    symbol: FIXTURE_424B5_REGISTERED_DIRECT.symbol,
    accessionNumber: FIXTURE_424B5_REGISTERED_DIRECT.accessionNumber,
    extracted: rd,
  });
  assert.ok(rdEvents.some((e) => e.eventType === "registered_direct"));
  assert.ok(rdEvents.some((e) => e.eventType === "prospectus_424b5"));

  const conv = extractDilutionInstruments(FIXTURE_CONVERTIBLE_NOTE);
  const convEvents = mapDilutionToCompanyEvents({
    symbol: FIXTURE_CONVERTIBLE_NOTE.symbol,
    accessionNumber: FIXTURE_CONVERTIBLE_NOTE.accessionNumber,
    extracted: conv,
  });
  assert.ok(convEvents.some((e) => e.eventType === "convertible_instrument"));

  const wr = extractDilutionInstruments(FIXTURE_WARRANT_REPRICE);
  const wrEvents = mapDilutionToCompanyEvents({
    symbol: FIXTURE_WARRANT_REPRICE.symbol,
    accessionNumber: FIXTURE_WARRANT_REPRICE.accessionNumber,
    extracted: wr,
  });
  assert.ok(wrEvents.some((e) => e.eventType === "warrant_reprice"));

  const rs = extractDilutionInstruments({
    ...FIXTURE_REVERSE_SPLIT,
    title: FIXTURE_REVERSE_SPLIT.title,
  });
  const rsEvents = mapDilutionToCompanyEvents({
    symbol: FIXTURE_REVERSE_SPLIT.symbol,
    accessionNumber: FIXTURE_REVERSE_SPLIT.accessionNumber,
    extracted: rs,
  });
  assert.ok(rsEvents.some((e) => e.eventType === "reverse_split"));
});

test("low-confidence dilution does not emit capital events", () => {
  const events = mapDilutionToCompanyEvents({
    symbol: "LOWC",
    accessionNumber: "0000000000-00-000001",
    extracted: [
      {
        instrumentType: "ATM_PROGRAM",
        status: "unknown",
        maxShares: null,
        maxDollars: null,
        offerPrice: null,
        warrantCount: null,
        warrantExercisePrice: null,
        potentialDilutionPct: null,
        estimateLabel: "unavailable",
        capacityKind: "other",
        confidence: CAPITAL_EVENT_MIN_CONFIDENCE - 0.1,
        missingFields: ["all"],
        evidenceSnippets: [],
        structuredSections: {},
        sharesOutstandingDenom: null,
        needsManualReview: true,
      },
    ],
  });
  assert.equal(events.length, 0);
});

test("all emitted event types are in central taxonomy", () => {
  const batches = [
    classifyFilingDisclosure(FIXTURE_8K_AUDITOR),
    classifyFilingDisclosure(FIXTURE_FORM4),
    classifyFilingDisclosure(FIXTURE_13D),
    mapDilutionToCompanyEvents({
      symbol: FIXTURE_S3_SHELF_ATM.symbol,
      accessionNumber: FIXTURE_S3_SHELF_ATM.accessionNumber,
      extracted: extractDilutionInstruments(FIXTURE_S3_SHELF_ATM),
    }),
  ];
  for (const events of batches) {
    for (const e of events) {
      assert.ok(isCompanyEventType(e.eventType), e.eventType);
    }
  }
});

test("filingEventFingerprint is accession-stable", () => {
  const a = filingEventFingerprint({
    symbol: "aapl",
    eventType: "sec_8k",
    accession: "0000320193-24-000001",
    discriminant: "form",
  });
  const b = filingEventFingerprint({
    symbol: "AAPL",
    eventType: "sec_8k",
    accession: "0000320193-24-000001",
    discriminant: "form",
  });
  assert.equal(a, b);
  assert.match(a, /^AAPL\|sec_8k\|sec\|/);
});

test("idempotent persist of company events", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL not set");
    return;
  }
  const { persistCompanyEvents } = await import(
    "../src/lib/company-events/persist.ts"
  );
  const events = classifyFilingDisclosure({
    ...FIXTURE_8K_AUDITOR,
    accessionNumber: `test-ce-${Date.now()}`,
  });
  const first = await persistCompanyEvents(events);
  const second = await persistCompanyEvents(events);
  assert.equal(first.upserted, events.length);
  assert.equal(second.upserted, events.length);
  assert.deepEqual(first.ids.sort(), second.ids.sort());

  const { prisma } = await import("../src/lib/prisma.ts");
  await prisma.companyEvent.deleteMany({
    where: { id: { in: first.ids } },
  });
});
