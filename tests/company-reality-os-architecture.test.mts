/**
 * Company Reality OS Phase 0 — architecture inventory exists and references core modules.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = join(import.meta.dirname, "..");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

test("Company Reality OS architecture doc exists with required sections", () => {
  const path = "docs/COMPANY_REALITY_OS_ARCHITECTURE.md";
  assert.ok(existsSync(join(ROOT, path)), `${path} missing`);
  const doc = read(path);
  for (const heading of [
    "Current persistence models",
    "Current domain services",
    "Proposed Evidence Graph",
    "Implementation order",
    "Security implications",
    "Data-correctness implications",
    "Cost implications",
  ]) {
    assert.match(doc, new RegExp(heading, "i"), `missing section: ${heading}`);
  }
  assert.match(doc, /MetricObservation/);
  assert.match(doc, /CompanyEvent/);
  assert.match(doc, /requireTrustTickerAccess|session\.user\.id/i);
  assert.match(doc, /UNKNOWN.*never|never.*zero/i);
});

test("core reuse paths referenced in architecture still exist", () => {
  const paths = [
    "src/lib/company-identity/resolve.ts",
    "src/lib/company-readiness/hydrate.ts",
    "src/lib/metrics/get-quarterly-delta.ts",
    "src/lib/ticker-what-changed/get-feed.ts",
    "src/lib/thesis/history.ts",
    "src/lib/research/overview.ts",
    "src/lib/portfolio-brief/build.ts",
  ];
  for (const p of paths) {
    assert.ok(existsSync(join(ROOT, p)), `expected path: ${p}`);
  }
});
