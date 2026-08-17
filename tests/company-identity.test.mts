/**
 * Canonical company identity resolver — SymbolMaster + SEC company_tickers.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  __resetIdentityLocksForTests,
  createMemoryIdentityStore,
  normalizeCik,
  normalizeSymbol,
  parseSecCompanyTickersJson,
  resolveCompanyIdentity,
} from "../src/lib/company-identity/index.ts";
import type {
  CompanyIdentityStore,
  SecTickerEntry,
  SecTickerMapResult,
} from "../src/lib/company-identity/types.ts";

const RKLB_CIK = "0001819994";
const RKLB_ENTRY: SecTickerEntry = {
  ticker: "RKLB",
  cik: RKLB_CIK,
  title: "Rocket Lab USA, Inc.",
};

function mappingWith(
  entries: SecTickerEntry[],
  ok = true
): SecTickerMapResult {
  const byTicker = new Map<string, SecTickerEntry>();
  const byCik = new Map<string, SecTickerEntry>();
  for (const e of entries) {
    byTicker.set(e.ticker, e);
    byCik.set(e.cik, e);
    byCik.set(e.cik.replace(/^0+/, "") || "0", e);
  }
  return {
    ok,
    byTicker,
    byCik,
    fetchedAt: Date.now(),
    errorCode: ok ? "ok" : "network",
  };
}

function rklbMapping(): SecTickerMapResult {
  return mappingWith([RKLB_ENTRY]);
}

test("normalizeSymbol handles case, whitespace, and junk", () => {
  assert.equal(normalizeSymbol("rklb"), "RKLB");
  assert.equal(normalizeSymbol("  RKLB  "), "RKLB");
  assert.equal(normalizeSymbol("rk-lb"), "RKLB");
  assert.equal(normalizeCik(1819994), RKLB_CIK);
  assert.equal(normalizeCik("1819994"), RKLB_CIK);
  assert.equal(normalizeCik(""), null);
  assert.equal(normalizeCik(null), null);
});

test("parseSecCompanyTickersJson skips incomplete rows and does not invent CIKs", () => {
  const parsed = parseSecCompanyTickersJson({
    "0": { cik_str: 1819994, ticker: "RKLB", title: "Rocket Lab USA, Inc." },
    "1": { ticker: "NOCIK" },
    "2": { cik_str: 320193, ticker: "aapl", title: "Apple Inc." },
  });
  assert.ok(parsed);
  assert.equal(parsed!.byTicker.get("RKLB")?.cik, RKLB_CIK);
  assert.equal(parsed!.byTicker.has("NOCIK"), false);
  assert.equal(parsed!.byTicker.get("AAPL")?.cik, "0000320193");
});

test("RKLB-style normal ticker resolves READY and persists once", async () => {
  __resetIdentityLocksForTests();
  const store = createMemoryIdentityStore();
  const first = await resolveCompanyIdentity("RKLB", {
    store,
    mapping: rklbMapping(),
  });
  assert.equal(first.status, "READY");
  assert.equal(first.symbol, "RKLB");
  assert.equal(first.cik, RKLB_CIK);
  assert.equal(first.name, "Rocket Lab USA, Inc.");
  assert.equal(first.persisted, true);
  assert.equal(first.code, "OK");
  assert.doesNotMatch(first.message, /postgres|password|secret|DATABASE_URL/i);

  const second = await resolveCompanyIdentity("RKLB", {
    store,
    mapping: "unavailable",
  });
  assert.equal(second.status, "READY");
  assert.equal(second.cik, RKLB_CIK);
  assert.equal(second.source, "symbol_master");
  assert.equal(second.persisted, false);
});

test("lowercase and whitespace tickers resolve the same identity", async () => {
  const store = createMemoryIdentityStore();
  const a = await resolveCompanyIdentity("  rklb\n", {
    store,
    mapping: rklbMapping(),
  });
  const b = await resolveCompanyIdentity("RkLb", {
    store,
    mapping: rklbMapping(),
  });
  assert.equal(a.status, "READY");
  assert.equal(b.status, "READY");
  assert.equal(a.symbol, "RKLB");
  assert.equal(b.symbol, "RKLB");
  assert.equal(a.cik, b.cik);
});

test("invalid ticker is NOT_FOUND and does not persist", async () => {
  const store = createMemoryIdentityStore();
  const empty = await resolveCompanyIdentity("   ", {
    store,
    mapping: rklbMapping(),
  });
  const junk = await resolveCompanyIdentity("!!!", {
    store,
    mapping: rklbMapping(),
  });
  assert.equal(empty.status, "NOT_FOUND");
  assert.equal(empty.code, "INVALID_SYMBOL");
  assert.equal(junk.status, "NOT_FOUND");
  assert.equal(junk.persisted, false);
  assert.equal(await store.findBySymbol(""), null);
});

test("unknown ticker is NOT_FOUND", async () => {
  const store = createMemoryIdentityStore();
  const hit = await resolveCompanyIdentity("ZZZZZ", {
    store,
    mapping: rklbMapping(),
  });
  assert.equal(hit.status, "NOT_FOUND");
  assert.equal(hit.code, "UNKNOWN_SYMBOL");
  assert.equal(hit.cik, null);
  assert.equal(hit.persisted, false);
});

test("existing identity with CIK is READY without mapping", async () => {
  const store = createMemoryIdentityStore([
    {
      symbol: "RKLB",
      name: "Rocket Lab USA, Inc.",
      cik: RKLB_CIK,
      assetType: "equity",
      isActive: true,
      refreshedAt: new Date(),
    },
  ]);
  const hit = await resolveCompanyIdentity("RKLB", {
    store,
    mapping: "unavailable",
  });
  assert.equal(hit.status, "READY");
  assert.equal(hit.source, "symbol_master");
  assert.equal(hit.persisted, false);
});

test("identity missing CIK is filled from SEC mapping", async () => {
  const store = createMemoryIdentityStore([
    {
      symbol: "RKLB",
      name: null,
      cik: null,
      assetType: "equity",
      isActive: true,
      refreshedAt: new Date(),
    },
  ]);
  const hit = await resolveCompanyIdentity("RKLB", {
    store,
    mapping: rklbMapping(),
  });
  assert.equal(hit.status, "READY");
  assert.equal(hit.cik, RKLB_CIK);
  assert.equal(hit.persisted, true);
  const saved = await store.findBySymbol("RKLB");
  assert.equal(saved?.cik, RKLB_CIK);
});

test("identity missing CIK stays NO_CIK when mapping has no row", async () => {
  const store = createMemoryIdentityStore([
    {
      symbol: "FAKE",
      name: "Not a filer",
      cik: null,
      assetType: "equity",
      isActive: true,
      refreshedAt: new Date(),
    },
  ]);
  const hit = await resolveCompanyIdentity("FAKE", {
    store,
    mapping: rklbMapping(),
  });
  assert.equal(hit.status, "NO_CIK");
  assert.equal(hit.cik, null);
  assert.equal(hit.code, "NO_CIK");
});

test("repeated resolution is idempotent", async () => {
  const store = createMemoryIdentityStore();
  const mapping = rklbMapping();
  const results = [];
  for (let i = 0; i < 3; i++) {
    results.push(await resolveCompanyIdentity("RKLB", { store, mapping }));
  }
  assert.ok(results.every((r) => r.status === "READY" && r.cik === RKLB_CIK));
  assert.equal(results[0].persisted, true);
  assert.equal(results[1].persisted, false);
  assert.equal(results[2].persisted, false);
});

test("concurrent resolution does not duplicate identity rows", async () => {
  __resetIdentityLocksForTests();
  const store = createMemoryIdentityStore();
  const mapping = rklbMapping();
  const [a, b, c] = await Promise.all([
    resolveCompanyIdentity("RKLB", { store, mapping }),
    resolveCompanyIdentity("rklb", { store, mapping }),
    resolveCompanyIdentity(" RKLB ", { store, mapping }),
  ]);
  assert.equal(a.status, "READY");
  assert.equal(b.status, "READY");
  assert.equal(c.status, "READY");
  assert.equal([a, b, c].filter((r) => r.persisted).length, 1);
  const saved = await store.findBySymbol("RKLB");
  assert.equal(saved?.cik, RKLB_CIK);
});

test("SEC mapping temporarily unavailable is ERROR for unknown tickers", async () => {
  const store = createMemoryIdentityStore();
  const hit = await resolveCompanyIdentity("ZZZZZ", {
    store,
    mapping: "unavailable",
  });
  assert.equal(hit.status, "ERROR");
  assert.equal(hit.code, "MAPPING_UNAVAILABLE");
  assert.equal(hit.mappingAvailable, false);
  assert.equal(hit.cik, null);
  assert.doesNotMatch(JSON.stringify(hit), /CRON_SECRET|DATABASE_URL|passwordHash/i);
});

test("inactive prior ticker aliases to the active symbol for the same CIK", async () => {
  const store = createMemoryIdentityStore([
    {
      symbol: "OLDT",
      name: "Old Name",
      cik: RKLB_CIK,
      assetType: "equity",
      isActive: false,
      refreshedAt: new Date(0),
    },
    {
      symbol: "RKLB",
      name: "Rocket Lab USA, Inc.",
      cik: RKLB_CIK,
      assetType: "equity",
      isActive: true,
      refreshedAt: new Date(),
    },
  ]);
  const hit = await resolveCompanyIdentity("OLDT", {
    store,
    mapping: "unavailable",
  });
  assert.equal(hit.status, "READY");
  assert.equal(hit.symbol, "RKLB");
  assert.equal(hit.aliasedFrom, "OLDT");
  assert.equal(hit.cik, RKLB_CIK);
});

test("store failures return ERROR without leaking internals", async () => {
  const store: CompanyIdentityStore = {
    async findBySymbol() {
      throw new Error("DATABASE_URL=postgres://secret@localhost/tt");
    },
    async findByCik() {
      return [];
    },
    async upsert() {
      throw new Error("nope");
    },
  };
  const hit = await resolveCompanyIdentity("RKLB", {
    store,
    mapping: rklbMapping(),
  });
  assert.equal(hit.status, "ERROR");
  assert.equal(hit.code, "STORE_ERROR");
  assert.equal(hit.message, "Could not resolve company identity.");
  assert.doesNotMatch(JSON.stringify(hit), /postgres:\/\/|secret@|DATABASE_URL/);
});
