/**
 * Research overview privacy + recent helpers.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PLATFORM_GUIDE_VERSION } from "../src/lib/platform-guide.ts";
import { RESEARCH_OVERVIEW_VERSION } from "../src/lib/research/types.ts";
import { researchRecentStorageKey } from "../src/lib/research/recent.ts";

test("platform guide bumped for Research workspace", () => {
  assert.ok(PLATFORM_GUIDE_VERSION >= 71);
  const guide = readFileSync(
    join(process.cwd(), "src/lib/platform-guide.ts"),
    "utf8"
  );
  assert.match(guide, /in-desk company workspace/i);
});

test("research overview composer never selects thesis note fields", () => {
  const src = readFileSync(
    join(process.cwd(), "src/lib/research/overview.ts"),
    "utf8"
  );
  assert.doesNotMatch(src, /thesisDto\.note|thesisDto\.premise|premise:/);
  assert.match(src, /healthStatus/);
  assert.match(src, /RESEARCH_OVERVIEW_VERSION|formatHealthSummaryLine/);
});

test("research API strips private fields on public access", () => {
  const src = readFileSync(
    join(process.cwd(), "src/app/api/research/[symbol]/overview/route.ts"),
    "utf8"
  );
  assert.match(src, /overview\.thesis = null/);
  assert.match(src, /overview\.monitoring = null/);
  assert.doesNotMatch(src, /userId:\s*body/);
});

test("Research desk stays in-desk (no full-page redirect launcher)", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/dashboard-shell/ResearchDesk.tsx"),
    "utf8"
  );
  assert.doesNotMatch(src, /window\.location\.assign\(`\/ticker/);
  assert.match(src, /research-company-workspace/);
  assert.match(src, /\/api\/research\/\$\{encodeURIComponent\(symbol\)\}\/readiness/);
  assert.match(src, /research-recent/);
  assert.match(src, /research-monitored/);
});

test("Add to Portfolio button posts portfolio API", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/research/AddToPortfolioButton.tsx"),
    "utf8"
  );
  assert.match(src, /\/api\/portfolio/);
  assert.match(src, /research-add-to-portfolio/);
  assert.match(src, /research-subscribe-gate|ResearchPersonalizedGate/);
});

test("recent storage key is stable", () => {
  assert.equal(researchRecentStorageKey(), "tt-research-recent-v1");
  assert.equal(RESEARCH_OVERVIEW_VERSION, "1.0.0");
});
