import assert from "node:assert/strict";
import test from "node:test";
import { bannerCopyFromHealth } from "../src/lib/company-readiness/ui-copy.ts";

test("NOT_HYDRATED uses preparing copy not generic no data yet", () => {
  const copy = bannerCopyFromHealth("FINANCIALS", "MISSING", {
    reasonCode: "NOT_HYDRATED",
    reasonSummary: "Hydration is queued.",
    retryEligible: true,
    sourceChecked: false,
  });
  assert.match(copy.title, /Preparing/i);
  assert.doesNotMatch(copy.body, /no data yet/i);
});

test("NO_QUALIFYING_RECORDS explains indexed check", () => {
  const copy = bannerCopyFromHealth("INSIDERS", "MISSING", {
    reasonCode: "NO_QUALIFYING_RECORDS",
    reasonSummary:
      "No qualifying Form 4 insider transactions were found in the indexed submissions window.",
    retryEligible: false,
    sourceChecked: true,
  });
  assert.match(copy.body, /qualifying/i);
});

test("ERROR shows retry-oriented title", () => {
  const copy = bannerCopyFromHealth("FILINGS", "ERROR", {
    reasonCode: "PARSER_FAILURE",
    reasonSummary: "Parse failed.",
    retryEligible: true,
    sourceChecked: true,
  });
  assert.match(copy.title, /couldn't refresh/i);
});
