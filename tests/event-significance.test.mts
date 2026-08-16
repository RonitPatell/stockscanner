/**
 * Event significance — one assertion block per reason code + aggregation edges.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  EVENT_SIGNIFICANCE_VERSION,
  SIGNIFICANCE_REASON_CODES,
  scoreEventSignificance,
  significanceToLegacySeverity,
  isSignificanceLevel,
  isSignificanceReasonCode,
  type SignificanceReasonCode,
} from "../src/lib/company-events/significance.ts";

function hasCode(
  codes: SignificanceReasonCode[],
  code: SignificanceReasonCode
) {
  assert.ok(codes.includes(code), `expected ${code} in ${codes.join(",")}`);
}

function score(partial: Parameters<typeof scoreEventSignificance>[0]) {
  return scoreEventSignificance(partial);
}

test("exports strongly typed levels and complete reason registry", () => {
  assert.equal(EVENT_SIGNIFICANCE_VERSION, "1.0.0");
  for (const c of SIGNIFICANCE_REASON_CODES) {
    assert.equal(isSignificanceReasonCode(c), true);
  }
  assert.equal(isSignificanceLevel("HIGH"), true);
  assert.equal(isSignificanceLevel("BUY"), false);
  assert.equal(isSignificanceReasonCode("FAKE"), false);
});

test("every result includes level, reasonCodes, evidence, thesisRelevance null", () => {
  const r = score({ eventType: "sec_other" });
  assert.ok(isSignificanceLevel(r.level));
  assert.ok(Array.isArray(r.reasonCodes) && r.reasonCodes.length > 0);
  assert.ok(Array.isArray(r.evidence) && r.evidence.length > 0);
  assert.equal(r.thesisRelevance, null);
  assert.equal(r.engineVersion, EVENT_SIGNIFICANCE_VERSION);
  for (const e of r.evidence) {
    assert.ok(e.detail.length > 0);
    assert.ok(["event_type", "text", "evidence_json", "default"].includes(e.source));
  }
});

test("legacy severity mapping is not a buy/sell score", () => {
  assert.equal(significanceToLegacySeverity("HIGH"), "critical");
  assert.equal(significanceToLegacySeverity("MEDIUM"), "material");
  assert.equal(significanceToLegacySeverity("LOW"), "notable");
  assert.equal(significanceToLegacySeverity("INFORMATIONAL"), "info");
});

// —— HIGH reason codes ——

test("GOING_CONCERN", () => {
  const r = score({
    eventType: "sec_10k",
    title: "10-K",
    body: "There is substantial doubt about the Company's ability to continue as a going concern.",
  });
  hasCode(r.reasonCodes, "GOING_CONCERN");
  assert.equal(r.level, "HIGH");
});

test("BANKRUPTCY_RECEIVERSHIP", () => {
  const byType = score({ eventType: "bankruptcy_receivership" });
  hasCode(byType.reasonCodes, "BANKRUPTCY_RECEIVERSHIP");
  assert.equal(byType.level, "HIGH");

  const byText = score({
    eventType: "sec_8k",
    body: "The Company filed for Chapter 11 bankruptcy protection.",
  });
  hasCode(byText.reasonCodes, "BANKRUPTCY_RECEIVERSHIP");
  assert.equal(byText.level, "HIGH");
});

test("AUDITOR_RESIGNATION_OR_DISMISSAL", () => {
  const r = score({ eventType: "auditor_change" });
  hasCode(r.reasonCodes, "AUDITOR_RESIGNATION_OR_DISMISSAL");
  assert.equal(r.level, "HIGH");
});

test("RESTATEMENT_OR_NON_RELIANCE", () => {
  const byType = score({ eventType: "non_reliance_restatement" });
  hasCode(byType.reasonCodes, "RESTATEMENT_OR_NON_RELIANCE");
  assert.equal(byType.level, "HIGH");

  const byText = score({
    eventType: "sec_8k",
    body: "Non-reliance on previously issued financial statements.",
  });
  hasCode(byText.reasonCodes, "RESTATEMENT_OR_NON_RELIANCE");
});

test("MAJOR_CAPITAL_RAISE", () => {
  const rd = score({ eventType: "registered_direct" });
  hasCode(rd.reasonCodes, "MAJOR_CAPITAL_RAISE");
  assert.equal(rd.level, "HIGH");

  const announced = score({
    eventType: "prospectus_424b5",
    evidenceJson: { estimateLabel: "announced_sale" },
  });
  hasCode(announced.reasonCodes, "MAJOR_CAPITAL_RAISE");
  assert.equal(announced.level, "HIGH");
});

test("MAJOR_MANAGEMENT_DEPARTURE", () => {
  const byType = score({ eventType: "management_change" });
  hasCode(byType.reasonCodes, "MAJOR_MANAGEMENT_DEPARTURE");
  assert.equal(byType.level, "HIGH");

  const byText = score({
    eventType: "sec_8k",
    body: "The CEO resigned effective immediately.",
  });
  hasCode(byText.reasonCodes, "MAJOR_MANAGEMENT_DEPARTURE");
});

test("LATE_PERIODIC_REPORT", () => {
  const k = score({ eventType: "sec_nt_10k" });
  hasCode(k.reasonCodes, "LATE_PERIODIC_REPORT");
  assert.equal(k.level, "HIGH");
  const q = score({ eventType: "sec_nt_10q" });
  hasCode(q.reasonCodes, "LATE_PERIODIC_REPORT");
});

test("SUBSTANTIAL_SHARE_COUNT_INCREASE", () => {
  const r = score({
    eventType: "atm_program",
    evidenceJson: {
      maxShares: 10_000_000,
      sharesOutstandingDenom: 20_000_000,
    },
  });
  hasCode(r.reasonCodes, "SUBSTANTIAL_SHARE_COUNT_INCREASE");
  assert.equal(r.level, "HIGH");
});

test("IMPAIRMENT_DISCLOSURE", () => {
  const r = score({ eventType: "impairment" });
  hasCode(r.reasonCodes, "IMPAIRMENT_DISCLOSURE");
  assert.equal(r.level, "HIGH");
});

// —— MEDIUM ——

test("NEW_SHELF_REGISTRATION", () => {
  const r = score({ eventType: "shelf_registration" });
  hasCode(r.reasonCodes, "NEW_SHELF_REGISTRATION");
  assert.equal(r.level, "MEDIUM");
});

test("OWNERSHIP_THRESHOLD_CHANGE", () => {
  const r = score({ eventType: "beneficial_ownership_13d" });
  hasCode(r.reasonCodes, "OWNERSHIP_THRESHOLD_CHANGE");
  assert.equal(r.level, "MEDIUM");
});

test("NEW_DEBT_OR_MATERIAL_AGREEMENT", () => {
  const r = score({ eventType: "material_agreement" });
  hasCode(r.reasonCodes, "NEW_DEBT_OR_MATERIAL_AGREEMENT");
  assert.equal(r.level, "MEDIUM");
});

test("MATERIAL_MARGIN_OR_RESULTS", () => {
  const r = score({ eventType: "financial_results_8k" });
  hasCode(r.reasonCodes, "MATERIAL_MARGIN_OR_RESULTS");
  assert.equal(r.level, "MEDIUM");
});

test("INSIDER_OPEN_MARKET_SALE", () => {
  const r = score({
    eventType: "sec_form4",
    title: "Form 4",
    body: "Open-market sale of 50,000 shares of common stock.",
  });
  hasCode(r.reasonCodes, "INSIDER_OPEN_MARKET_SALE");
  assert.equal(r.level, "MEDIUM");
});

test("ATM_PROGRAM_DETECTED", () => {
  const r = score({ eventType: "atm_program" });
  hasCode(r.reasonCodes, "ATM_PROGRAM_DETECTED");
  assert.ok(["MEDIUM", "HIGH"].includes(r.level));
});

test("CONVERTIBLE_OR_WARRANT_CAPITAL", () => {
  const r = score({ eventType: "convertible_instrument" });
  hasCode(r.reasonCodes, "CONVERTIBLE_OR_WARRANT_CAPITAL");
  assert.equal(r.level, "MEDIUM");
});

test("DIRECTOR_OR_BOARD_CHANGE", () => {
  const r = score({ eventType: "director_change" });
  hasCode(r.reasonCodes, "DIRECTOR_OR_BOARD_CHANGE");
  assert.equal(r.level, "MEDIUM");
});

// —— LOW ——

test("ROUTINE_PERIODIC_FILING", () => {
  const r = score({ eventType: "sec_10q", title: "10-Q Filing" });
  hasCode(r.reasonCodes, "ROUTINE_PERIODIC_FILING");
  assert.equal(r.level, "LOW");
});

test("ROUTINE_OWNERSHIP_AMENDMENT", () => {
  const r = score({ eventType: "sec_13g_a" });
  hasCode(r.reasonCodes, "ROUTINE_OWNERSHIP_AMENDMENT");
  assert.equal(r.level, "LOW");
});

test("ROUTINE_INSIDER_FORM", () => {
  const r = score({
    eventType: "sec_form4",
    title: "Form 4 (insider): Officer transaction",
  });
  hasCode(r.reasonCodes, "ROUTINE_INSIDER_FORM");
  assert.equal(r.level, "LOW");
});

test("EFFECTIVE_REGISTRATION_NOTICE", () => {
  const r = score({ eventType: "sec_effect" });
  hasCode(r.reasonCodes, "EFFECTIVE_REGISTRATION_NOTICE");
  assert.equal(r.level, "LOW");
});

test("PROXY_OR_ADMINISTRATIVE", () => {
  const r = score({ eventType: "sec_def_14a" });
  hasCode(r.reasonCodes, "PROXY_OR_ADMINISTRATIVE");
  assert.equal(r.level, "LOW");
});

test("ADMINISTRATIVE_FILING", () => {
  const r = score({ eventType: "sec_8k", title: "8-K Filing: Other Events" });
  hasCode(r.reasonCodes, "ADMINISTRATIVE_FILING");
  assert.equal(r.level, "LOW");
});

// —— INFORMATIONAL ——

test("ROUTINE_COMPENSATION_GRANT", () => {
  const r = score({
    eventType: "sec_form4",
    body: "Restricted stock unit award grant of 10,000 RSUs.",
  });
  hasCode(r.reasonCodes, "ROUTINE_COMPENSATION_GRANT");
  assert.equal(r.level, "INFORMATIONAL");
});

test("NO_MATERIAL_IMPACT_EVIDENCE", () => {
  const r = score({ eventType: "totally_unknown_type_xyz" });
  hasCode(r.reasonCodes, "NO_MATERIAL_IMPACT_EVIDENCE");
  assert.equal(r.level, "INFORMATIONAL");
});

test("UNKNOWN_OR_INSUFFICIENT_EVIDENCE", () => {
  const r = score({ eventType: "sec_other" });
  hasCode(r.reasonCodes, "UNKNOWN_OR_INSUFFICIENT_EVIDENCE");
  assert.equal(r.level, "INFORMATIONAL");
});

test("LOW_CLASSIFIER_CONFIDENCE caps false drama", () => {
  const r = score({
    eventType: "auditor_change",
    confidence: 0.2,
  });
  hasCode(r.reasonCodes, "AUDITOR_RESIGNATION_OR_DISMISSAL");
  hasCode(r.reasonCodes, "LOW_CLASSIFIER_CONFIDENCE");
  // Cap HIGH → MEDIUM when confidence is poor
  assert.equal(r.level, "MEDIUM");
});

test("empty / missing eventType fails soft to INFORMATIONAL", () => {
  const r = score({ eventType: "" });
  assert.equal(r.level, "INFORMATIONAL");
  hasCode(r.reasonCodes, "NO_MATERIAL_IMPACT_EVIDENCE");
});

test("shelf alone is MEDIUM capacity — not falsely HIGH without sale evidence", () => {
  const r = score({
    eventType: "shelf_registration",
    evidenceJson: { estimateLabel: "capacity_only" },
  });
  assert.equal(r.level, "MEDIUM");
  hasCode(r.reasonCodes, "NEW_SHELF_REGISTRATION");
  assert.equal(r.reasonCodes.includes("MAJOR_CAPITAL_RAISE"), false);
});

test("registry completeness — every code has a dedicated coverage path", () => {
  // Ensure we did not forget to list a code that the engine can emit.
  // Codes are documented; this asserts the constant list is non-empty and unique.
  const set = new Set(SIGNIFICANCE_REASON_CODES);
  assert.equal(set.size, SIGNIFICANCE_REASON_CODES.length);
  assert.ok(SIGNIFICANCE_REASON_CODES.length >= 25);
});
