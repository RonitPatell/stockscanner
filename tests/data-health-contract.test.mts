/**
 * Data health contract — reason codes and MISSING vs confirmed-empty semantics.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  DATA_HEALTH_REASON_CODES,
  resolveDataHealthReason,
} from "../src/lib/company-readiness/data-health.ts";
import { buildReadinessDto, emptyInspect } from "../src/lib/company-readiness/derive.ts";
import type { CompanyIdentityResult } from "../src/lib/company-identity/types.ts";
import type { DatasetReadiness } from "../src/lib/company-readiness/types.ts";

function readyIdentity(): CompanyIdentityResult {
  return {
    status: "READY",
    requestedSymbol: "RKLB",
    symbol: "RKLB",
    cik: "0001819994",
    name: "Rocket Lab USA, Inc.",
    assetType: "equity",
    source: "sec_mapping",
    aliasedFrom: null,
    persisted: true,
    mappingAvailable: true,
    code: "OK",
    message: "SEC identity is ready.",
  };
}

function row(
  dataset: DatasetReadiness["dataset"],
  patch: Partial<DatasetReadiness> & Pick<DatasetReadiness, "status">
): DatasetReadiness {
  return {
    dataset,
    status: patch.status,
    lastAttemptAt: patch.lastAttemptAt ?? null,
    lastSuccessAt: patch.lastSuccessAt ?? null,
    dataAsOf: patch.dataAsOf ?? null,
    nextEligibleRefreshAt: patch.nextEligibleRefreshAt ?? null,
    rowCount: patch.rowCount ?? null,
    lastErrorCode: patch.lastErrorCode ?? null,
    lastErrorSummary: patch.lastErrorSummary ?? null,
  };
}

test("reason code catalog is stable", () => {
  assert.ok(DATA_HEALTH_REASON_CODES.includes("NOT_HYDRATED"));
  assert.ok(DATA_HEALTH_REASON_CODES.includes("NO_QUALIFYING_RECORDS"));
  assert.ok(DATA_HEALTH_REASON_CODES.includes("READY_EMPTY_CONFIRMED"));
});

test("MISSING without attempt → NOT_HYDRATED", () => {
  const h = resolveDataHealthReason({
    dataset: "FINANCIALS",
    row: row("FINANCIALS", { status: "MISSING", rowCount: 0 }),
    identity: readyIdentity(),
    job: null,
  });
  assert.equal(h.reasonCode, "NOT_HYDRATED");
  assert.equal(h.sourceChecked, false);
  assert.equal(h.retryEligible, true);
});

test("PROCESSING → PROCESSING reason", () => {
  const h = resolveDataHealthReason({
    dataset: "FINANCIALS",
    row: row("FINANCIALS", { status: "PROCESSING", rowCount: 0 }),
    identity: readyIdentity(),
    job: { status: "RUNNING" } as never,
  });
  assert.equal(h.reasonCode, "PROCESSING");
  assert.equal(h.sourceChecked, false);
});

test("MISSING with qualifying empty summary → NO_QUALIFYING_RECORDS", () => {
  const h = resolveDataHealthReason({
    dataset: "INSIDERS",
    row: row("INSIDERS", {
      status: "MISSING",
      rowCount: 0,
      lastAttemptAt: new Date().toISOString(),
      lastErrorSummary: "No recent Form 4 filings in the company submissions index.",
    }),
    identity: readyIdentity(),
    job: null,
  });
  assert.equal(h.reasonCode, "NO_QUALIFYING_RECORDS");
  assert.equal(h.sourceChecked, true);
});

test("ERROR parser code maps to PARSER_FAILURE", () => {
  const h = resolveDataHealthReason({
    dataset: "FILINGS",
    row: row("FILINGS", {
      status: "ERROR",
      lastErrorCode: "FILINGS_FAILED",
      lastAttemptAt: new Date().toISOString(),
    }),
    identity: readyIdentity(),
    job: null,
  });
  assert.equal(h.reasonCode, "PARSER_FAILURE");
  assert.equal(h.retryEligible, true);
});

test("buildReadinessDto attaches health to every dataset", () => {
  const inspect = emptyInspect();
  const asOf = new Date();
  inspect.FINANCIALS = { rowCount: 12, dataAsOf: asOf };
  inspect.COMPANY_STATE = { rowCount: 12, dataAsOf: asOf };
  const readiness = buildReadinessDto({
    symbol: "RKLB",
    identity: readyIdentity(),
    inspect,
    job: null,
    states: [],
    covered: true,
    hydrationEnqueued: false,
    now: new Date(),
    include13F: false,
  });
  assert.equal(readiness.companyEvents, "MISSING");
  assert.equal(readiness.companyState, "READY");
  assert.ok(readiness.datasets.FINANCIALS.health?.reasonCode === "READY");
  assert.ok(readiness.datasets.COMPANY_STATE.health?.reasonCode === "READY");
  assert.ok(readiness.datasets.FINANCIALS.health?.sourceChecked);
});

test("NOT_FOUND identity → NO_SYMBOL", () => {
  const h = resolveDataHealthReason({
    dataset: "FINANCIALS",
    row: row("FINANCIALS", { status: "MISSING" }),
    identity: {
      ...readyIdentity(),
      status: "NOT_FOUND",
      symbol: null,
      cik: null,
    },
    job: null,
  });
  assert.equal(h.reasonCode, "NO_SYMBOL");
});
