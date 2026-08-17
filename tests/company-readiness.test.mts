/**
 * Company readiness coordinator + hydration (memory stores, no live SEC).
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  createMemoryIdentityStore,
  resolveCompanyIdentity,
} from "../src/lib/company-identity/index.ts";
import type { CompanyIdentityResult } from "../src/lib/company-identity/types.ts";
import { ensureCompanyReady } from "../src/lib/company-readiness/ensure.ts";
import { hydrateCompanySymbol } from "../src/lib/company-readiness/hydrate.ts";
import { runHydrationCron } from "../src/lib/company-readiness/cron.ts";
import { createMemoryReadinessStores } from "../src/lib/company-readiness/stores.ts";
import { emptyInspect } from "../src/lib/company-readiness/derive.ts";
import {
  parseSubmissionsRecent,
  selectFilingsForHydration,
} from "../src/lib/company-readiness/submissions.ts";
import type { ReadinessInspect } from "../src/lib/company-readiness/types.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RKLB_CIK = "0001819994";

function readyIdentity(symbol = "RKLB"): CompanyIdentityResult {
  return {
    status: "READY",
    requestedSymbol: symbol,
    symbol,
    cik: RKLB_CIK,
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

test("opening a valid ticker requests coverage when asked", async () => {
  const { datasets, jobs } = createMemoryReadinessStores();
  let covered = 0;
  await ensureCompanyReady("RKLB", {
    identity: readyIdentity(),
    enqueue: true,
    ensureCoverage: true,
    ports: {
      datasets,
      jobs,
      inspect: async () => emptyInspect(),
      ensureCoverage: async () => {
        covered += 1;
      },
    },
  });
  assert.equal(covered, 1);
});

test("brand-new company enqueues hydration and marks PROCESSING/MISSING", async () => {
  const { datasets, jobs } = createMemoryReadinessStores();
  const inspect = emptyInspect();
  const r = await ensureCompanyReady("RKLB", {
    identity: readyIdentity(),
    enqueue: true,
    ensureCoverage: false,
    ports: {
      datasets,
      jobs,
      inspect: async () => inspect,
      ensureCoverage: async () => {},
      coverageExists: async () => true,
    },
  });
  assert.equal(r.identityStatus, "READY");
  assert.equal(r.hydrationEnqueued, true);
  assert.equal(r.jobStatus, "PENDING");
  assert.equal(r.financials, "PROCESSING");
  const job = await jobs.get("RKLB");
  assert.equal(job?.status, "PENDING");
});

test("already-ready company does not enqueue", async () => {
  const { datasets, jobs } = createMemoryReadinessStores();
  const inspect: ReadinessInspect = {
    FINANCIALS: { rowCount: 12, dataAsOf: new Date() },
    CAPITAL: { rowCount: 1, dataAsOf: new Date() },
    FILINGS: { rowCount: 2, dataAsOf: new Date() },
    INSIDERS: { rowCount: 3, dataAsOf: new Date() },
    OWNERSHIP: { rowCount: 1, dataAsOf: new Date() },
    INSTITUTIONAL_13F: { rowCount: 0, dataAsOf: null },
  };
  const r = await ensureCompanyReady("RKLB", {
    identity: readyIdentity(),
    enqueue: true,
    ensureCoverage: false,
    ports: {
      datasets,
      jobs,
      inspect: async () => inspect,
      ensureCoverage: async () => {},
    },
  });
  assert.equal(r.financials, "READY");
  assert.equal(r.hydrationEnqueued, false);
  assert.equal(await jobs.get("RKLB"), null);
});

test("stale company enqueues refresh", async () => {
  const { datasets, jobs } = createMemoryReadinessStores();
  const old = new Date(Date.now() - 80 * 24 * 3600_000);
  const inspect: ReadinessInspect = {
    FINANCIALS: { rowCount: 4, dataAsOf: old },
    CAPITAL: { rowCount: 1, dataAsOf: old },
    FILINGS: { rowCount: 1, dataAsOf: old },
    INSIDERS: { rowCount: 1, dataAsOf: old },
    OWNERSHIP: { rowCount: 1, dataAsOf: old },
    INSTITUTIONAL_13F: { rowCount: 0, dataAsOf: null },
  };
  const r = await ensureCompanyReady("RKLB", {
    identity: readyIdentity(),
    enqueue: true,
    ensureCoverage: false,
    ports: { datasets, jobs, inspect: async () => inspect, ensureCoverage: async () => {} },
  });
  assert.equal(r.hydrationEnqueued, true);
  assert.ok(r.financials === "STALE" || r.financials === "PROCESSING");
});

test("two simultaneous ensure calls do not duplicate jobs", async () => {
  const { datasets, jobs } = createMemoryReadinessStores();
  const ports = {
    datasets,
    jobs,
    inspect: async () => emptyInspect(),
    ensureCoverage: async () => {},
  };
  const [a, b] = await Promise.all([
    ensureCompanyReady("RKLB", {
      identity: readyIdentity(),
      enqueue: true,
      ensureCoverage: false,
      ports,
    }),
    ensureCompanyReady("RKLB", {
      identity: readyIdentity(),
      enqueue: true,
      ensureCoverage: false,
      ports,
    }),
  ]);
  assert.equal(a.hydrationEnqueued || b.hydrationEnqueued, true);
  assert.equal((await jobs.get("RKLB"))?.status, "PENDING");
});

test("failed previous hydration respects retry backoff", async () => {
  const { datasets, jobs } = createMemoryReadinessStores();
  const now = new Date();
  await jobs.upsertEnqueue({ symbol: "RKLB", now, userId: "u1" });
  await jobs.complete({
    symbol: "RKLB",
    status: "FAILED",
    now,
    nextEligibleAt: new Date(now.getTime() + 60 * 60_000),
    lastErrorSummary: "CompanyFacts could not be fetched.",
  });
  const r = await ensureCompanyReady("RKLB", {
    identity: readyIdentity(),
    enqueue: true,
    ensureCoverage: false,
    now,
    ports: {
      datasets,
      jobs,
      inspect: async () => emptyInspect(),
      ensureCoverage: async () => {},
    },
  });
  assert.equal(r.hydrationEnqueued, false);
  assert.equal((await jobs.get("RKLB"))?.status, "FAILED");
});

test("missing CIK does not enqueue SEC hydration", async () => {
  const { datasets, jobs } = createMemoryReadinessStores();
  const identity: CompanyIdentityResult = {
    ...readyIdentity(),
    status: "NO_CIK",
    cik: null,
    code: "NO_CIK",
    message: "Ticker is known but no SEC CIK is available.",
  };
  const r = await ensureCompanyReady("RKLB", {
    identity,
    enqueue: true,
    ensureCoverage: false,
    ports: {
      datasets,
      jobs,
      inspect: async () => emptyInspect(),
      ensureCoverage: async () => {},
    },
  });
  assert.equal(r.identityStatus, "NO_CIK");
  assert.equal(r.financials, "UNSUPPORTED");
  assert.equal(r.hydrationEnqueued, false);
});

test("unsupported 13F is not required for enqueue", async () => {
  const { datasets, jobs } = createMemoryReadinessStores();
  const inspect: ReadinessInspect = {
    ...emptyInspect(),
    FINANCIALS: { rowCount: 3, dataAsOf: new Date() },
    CAPITAL: { rowCount: 1, dataAsOf: new Date() },
    FILINGS: { rowCount: 1, dataAsOf: new Date() },
    INSIDERS: { rowCount: 1, dataAsOf: new Date() },
    OWNERSHIP: { rowCount: 1, dataAsOf: new Date() },
  };
  const r = await ensureCompanyReady("RKLB", {
    identity: readyIdentity(),
    enqueue: true,
    include13F: false,
    ensureCoverage: false,
    ports: { datasets, jobs, inspect: async () => inspect, ensureCoverage: async () => {} },
  });
  assert.equal(r.institutional13F, "MISSING");
  assert.equal(r.hydrationEnqueued, false);
});

test("hydrate fills financials via shared ingestCompanyfactsMetrics and isolates dataset failures", async () => {
  const { datasets, jobs } = createMemoryReadinessStores();
  await jobs.upsertEnqueue({ symbol: "RKLB", now: new Date(), userId: null });
  const result = await hydrateCompanySymbol("RKLB", {
    datasets,
    identity: readyIdentity(),
    fetchFacts: async () => ({ cik: RKLB_CIK, entityName: "Rocket Lab" }) as never,
    ingestFacts: async () => ({
      observations: [{ metricKey: "revenue", value: 1 }] as never,
      upserted: 1,
      ids: ["1"],
    }),
    fetchSubmissions: async () => [
      {
        form: "4",
        accessionNumber: "0001819994-24-000001",
        filingDate: "2024-01-01",
        primaryDocument: "primary_doc.xml",
        sourceUrl:
          "https://www.sec.gov/Archives/edgar/data/1819994/000181999424000001/",
      },
    ],
    processForm4: async () => {
      throw new Error("form4 boom DATABASE_URL=postgres://secret");
    },
    processOwnership: async () => ({
      extracted: false,
      id: null,
      extract: null,
    }),
    processFilings: async () => ({ processed: 0, materialEvents: 0 }),
    processDilution: async () => ({ extracted: 0, ids: [], results: [] }),
    refreshCapital: async () => null,
  });
  assert.equal(result.financials, "READY");
  assert.equal(result.insiders, "ERROR");
  assert.equal(result.capital, "READY");
  const fin = await datasets.get("RKLB", "FINANCIALS");
  assert.equal(fin?.status, "READY");
  const ins = await datasets.get("RKLB", "INSIDERS");
  assert.equal(ins?.status, "ERROR");
  assert.doesNotMatch(ins?.lastErrorSummary ?? "", /postgres:\/\/secret/);
});

test("hydration cron claims a pending job once", async () => {
  const { datasets, jobs } = createMemoryReadinessStores();
  await jobs.upsertEnqueue({ symbol: "RKLB", now: new Date(), userId: "u" });
  const cron = await runHydrationCron({
    jobs,
    limit: 2,
    hydratePorts: {
      datasets,
      identity: readyIdentity(),
      fetchFacts: async () => null,
      ingestFacts: async () => ({ observations: [], upserted: 0, ids: [] }),
      fetchSubmissions: async () => [],
      processForm4: async () => ({ extracted: 0, ids: [], parsed: null }),
      processOwnership: async () => ({ extracted: false, id: null, extract: null }),
      processFilings: async () => ({ processed: 0, materialEvents: 0 }),
      processDilution: async () => ({ extracted: 0, ids: [], results: [] }),
      refreshCapital: async () => null,
    },
  });
  assert.equal(cron.claimed, 1);
  const job = await jobs.get("RKLB");
  assert.ok(job);
  assert.notEqual(job!.status, "RUNNING");
});

test("submissions parser selects bounded form types", () => {
  const json = {
    filings: {
      recent: {
        form: ["4", "10-Q", "SC 13G", "S-3", "8-K"],
        accessionNumber: ["a", "b", "c", "d", "e"],
        filingDate: ["2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05"],
        primaryDocument: ["p.xml", "q.htm", "o.htm", "s.htm", "k.htm"],
      },
    },
  };
  const refs = parseSubmissionsRecent(json, RKLB_CIK);
  const sel = selectFilingsForHydration(refs);
  assert.equal(sel.form4.length, 1);
  assert.equal(sel.periodic.length, 1);
  assert.equal(sel.ownership.length, 1);
  assert.equal(sel.capital.length, 1);
});

test("invalid identity from resolver is NOT_FOUND without jobs", async () => {
  const store = createMemoryIdentityStore();
  const identity = await resolveCompanyIdentity("!!!", {
    store,
    mapping: { ok: true, byTicker: new Map(), byCik: new Map(), fetchedAt: 0, errorCode: "ok" },
  });
  const { datasets, jobs } = createMemoryReadinessStores();
  const r = await ensureCompanyReady("!!!", {
    identity,
    enqueue: true,
    ports: { datasets, jobs, inspect: async () => emptyInspect() },
  });
  assert.equal(r.identityStatus, "NOT_FOUND");
  assert.equal(r.hydrationEnqueued, false);
});

test("research readiness route is inspect+enqueue for entitled, not a live SEC page fetch", () => {
  const src = readFileSync(
    join(process.cwd(), "src/app/api/research/[symbol]/readiness/route.ts"),
    "utf8"
  );
  assert.match(src, /ensureCompanyReady/);
  assert.match(src, /enqueue: entitled/);
  assert.doesNotMatch(src, /fetchCompanyfacts/);
  assert.doesNotMatch(src, /userId:\s*body/);
});

test("dev hydrate endpoint fails closed outside local unless admin", () => {
  const src = readFileSync(
    join(process.cwd(), "src/app/api/dev/hydrate/route.ts"),
    "utf8"
  );
  assert.match(src, /isAdminEmail/);
  assert.match(src, /NODE_ENV === "development"/);
  assert.match(src, /hydrateCompanySymbol/);
});

test("cron hydrate reuses hydrateCompanySymbol", () => {
  const src = readFileSync(
    join(process.cwd(), "src/app/api/cron/hydrate/route.ts"),
    "utf8"
  );
  assert.match(src, /authorizeCron/);
  assert.match(src, /runHydrationCron/);
});
