/**
 * Phase 5 — Real-data identity / CIK certification for the test universe.
 * Uses fixture SEC mapping (CI-safe). Live SEC is covered by npm run hydrate.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  __resetIdentityLocksForTests,
  createMemoryIdentityStore,
  normalizeSymbol,
  resolveCompanyIdentity,
} from "../src/lib/company-identity/index.ts";
import type {
  SecTickerEntry,
  SecTickerMapResult,
} from "../src/lib/company-identity/types.ts";

/** From docs/REAL_DATA_TEST_UNIVERSE.md — CIKs are official SEC company_tickers values. */
const UNIVERSE: SecTickerEntry[] = [
  { ticker: "RKLB", cik: "0001819994", title: "Rocket Lab USA, Inc." },
  { ticker: "AAPL", cik: "0000320193", title: "Apple Inc." },
  { ticker: "MSFT", cik: "0000789019", title: "MICROSOFT CORP" },
  { ticker: "JPM", cik: "0000019617", title: "JPMORGAN CHASE & CO" },
  { ticker: "CAT", cik: "0000018230", title: "Caterpillar Inc" },
  { ticker: "LMT", cik: "0000936468", title: "LOCKHEED MARTIN CORP" },
  { ticker: "TSLA", cik: "0001318605", title: "Tesla, Inc." },
  { ticker: "MRNA", cik: "0001682852", title: "Moderna, Inc." },
  { ticker: "PLUG", cik: "0001093691", title: "PLUG POWER INC" },
  { ticker: "MDB", cik: "0001441816", title: "MongoDB, Inc." },
  { ticker: "WMT", cik: "0000104169", title: "Walmart Inc." },
  { ticker: "BRKB", cik: "0001067983", title: "BERKSHIRE HATHAWAY INC" },
];

function universeMapping(): SecTickerMapResult {
  const byTicker = new Map<string, SecTickerEntry>();
  const byCik = new Map<string, SecTickerEntry>();
  for (const e of UNIVERSE) {
    byTicker.set(e.ticker, e);
    byCik.set(e.cik, e);
    byCik.set(e.cik.replace(/^0+/, "") || "0", e);
  }
  return {
    ok: true,
    byTicker,
    byCik,
    fetchedAt: Date.now(),
    errorCode: "ok",
  };
}

test("test-universe symbols normalize cleanly", () => {
  assert.equal(normalizeSymbol("rklb"), "RKLB");
  assert.equal(normalizeSymbol(" AAPL "), "AAPL");
  assert.equal(normalizeSymbol("brk.b"), "BRKB");
  assert.equal(normalizeSymbol("BRK-B"), "BRKB");
  assert.equal(normalizeSymbol(""), "");
  assert.equal(normalizeSymbol("!!!"), "");
});

test("every universe symbol resolves READY with expected CIK", async () => {
  __resetIdentityLocksForTests();
  const store = createMemoryIdentityStore();
  const mapping = universeMapping();
  for (const entry of UNIVERSE) {
    const result = await resolveCompanyIdentity(entry.ticker.toLowerCase(), {
      store,
      mapping,
    });
    assert.equal(result.status, "READY", entry.ticker);
    assert.equal(result.symbol, entry.ticker);
    assert.equal(result.cik, entry.cik);
    assert.ok(result.name);
  }
});

test("invalid and unknown symbols stay NOT_FOUND", async () => {
  __resetIdentityLocksForTests();
  const store = createMemoryIdentityStore();
  const mapping = universeMapping();
  for (const raw of ["", " ", "!!!!!", "ZZZZZ", "TOOLONG"]) {
    const result = await resolveCompanyIdentity(raw, { store, mapping });
    assert.equal(result.status, "NOT_FOUND", raw);
  }
});

test("repeated and concurrent resolution stay idempotent for AAPL", async () => {
  __resetIdentityLocksForTests();
  const store = createMemoryIdentityStore();
  const mapping = universeMapping();
  const [a, b, c] = await Promise.all([
    resolveCompanyIdentity("aapl", { store, mapping }),
    resolveCompanyIdentity(" AAPL ", { store, mapping }),
    resolveCompanyIdentity("AAPL", { store, mapping }),
  ]);
  assert.equal(a.status, "READY");
  assert.equal(a.cik, b.cik);
  assert.equal(b.cik, c.cik);
  assert.equal(a.symbol, "AAPL");
});
