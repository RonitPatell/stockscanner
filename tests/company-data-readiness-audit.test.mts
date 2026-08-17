/**
 * Lightweight invariants for docs/COMPANY_DATA_READINESS_AUDIT.md.
 * Does not implement hydration — locks current pipeline facts so the audit stays honest.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { ACTIVE_US_TICKERS } from "../src/lib/news-sources/active-tickers.ts";
import { COVERAGE_REASONS, isCoverageReason } from "../src/lib/coverage/types.ts";
import { companyfactsUrlForCik } from "../src/lib/metrics/companyfacts.ts";
import { isValidTickerFormat } from "../src/lib/ticker-utils.ts";

const ROOT = path.resolve(import.meta.dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

test("audit doc exists and traces RKLB plus empty-state collapse", () => {
  const doc = read("docs/COMPANY_DATA_READINESS_AUDIT.md");
  assert.match(doc, /RKLB/);
  assert.match(doc, /resolveCompanyIdentity/);
  assert.match(doc, /ensureCompanyReady/);
  assert.match(doc, /No structured financial observations/);
  assert.match(doc, /company_tickers\.json/);
  assert.match(doc, /\/api\/cron\/metrics/);
  assert.match(doc, /without SEC on page render/);
});

test("RKLB is curated-core eligible and a valid ticker format", () => {
  assert.equal(isValidTickerFormat("RKLB"), true);
  assert.ok(ACTIVE_US_TICKERS.includes("RKLB"));
  assert.equal(isValidTickerFormat("rklb"), false);
});

test("coverage has no Research-intent reason", () => {
  assert.equal(isCoverageReason("RESEARCH"), false);
  assert.equal(isCoverageReason("RESEARCH_INTEREST"), false);
  assert.ok(COVERAGE_REASONS.includes("CURATED_CORE"));
  assert.ok(COVERAGE_REASONS.includes("USER_WATCHLIST"));
  assert.equal(COVERAGE_REASONS.includes("RESEARCH_INTEREST" as never), false);
});

test("metrics cron skips missing CIK and only walks portfolio + SymbolCoverage", () => {
  const src = read("src/lib/metrics/cron.ts");
  assert.match(src, /portfolioItem\.findMany/);
  assert.match(src, /symbolCoverage\.findMany/);
  assert.doesNotMatch(src, /getActiveCoverageSymbols/);
  assert.match(src, /if \(!cik\)/);
  assert.match(src, /ingestCompanyfactsMetrics/);
  assert.match(src, /fetchCompanyfacts/);
});

test("CompanyFacts URL pads CIK; Research desk does not enqueue coverage", () => {
  assert.equal(
    companyfactsUrlForCik("1819994"),
    "https://data.sec.gov/api/xbrl/companyfacts/CIK0001819994.json"
  );
  const desk = read("src/components/dashboard-shell/ResearchDesk.tsx");
  assert.doesNotMatch(desk, /\/api\/cron\//);
  assert.doesNotMatch(desk, /upsertCoverage/);
  assert.match(desk, /openSymbol/);
});

test("Financials / Insiders empty copy does not distinguish processing vs unavailable", () => {
  const delta = read("src/components/ticker/QuarterlyDeltaTable.tsx");
  const insiders = read("src/components/ticker/InsidersTab.tsx");
  const filings = read("src/components/ticker/FilingsTab.tsx");
  assert.match(delta, /No structured financial observations for \{report\.symbol\} yet/);
  assert.match(insiders, /No structured Form 4 transactions parsed for \{report\.symbol\} yet/);
  assert.match(filings, /No section comparisons cached for \{report\.symbol\} yet/);
  assert.doesNotMatch(delta, /Preparing financial data/);
  assert.doesNotMatch(insiders, /PROCESSING/);
});

test("company_tickers.json is fetched from two sites (duplicate to collapse later)", () => {
  const master = read("src/lib/coverage/symbol-master.ts");
  const edgar = read("src/lib/news-sources/sec-edgar.ts");
  assert.match(master, /www\.sec\.gov\/files\/company_tickers\.json/);
  assert.match(edgar, /www\.sec\.gov\/files\/company_tickers\.json/);
});

test("vercel.json schedules coverage + metrics; package.json has no hydrate script yet", () => {
  const vercel = JSON.parse(read("vercel.json")) as {
    crons: { path: string }[];
  };
  const paths = vercel.crons.map((c) => c.path);
  assert.ok(paths.some((p) => p.startsWith("/api/cron/coverage")));
  assert.ok(paths.some((p) => p.startsWith("/api/cron/metrics")));
  assert.ok(paths.some((p) => p.startsWith("/api/cron/filings")));
  assert.equal(paths.some((p) => p.includes("hydrate")), false);

  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  assert.equal(pkg.scripts.hydrate, undefined);
  assert.equal(pkg.scripts["hydrate:portfolio"], undefined);
});

test("local next dev starts ingest loop but metrics cron is not imported there", () => {
  const engine = read("src/lib/catalyst-engine.ts");
  assert.match(engine, /startInstantIngestLoop/);
  assert.match(engine, /NODE_ENV !== "production"/);
  assert.doesNotMatch(engine, /runMetricsCompanyfactsCron/);
  assert.doesNotMatch(engine, /refreshSymbolMaster/);
});
