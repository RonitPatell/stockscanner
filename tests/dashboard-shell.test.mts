/**
 * Dashboard Shell V3 — destinations, deep links, guide target uniqueness.
 * Imports avoid dashboard-shell/index (pulls monitor flags with @/ aliases).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DASHBOARD_SHELL_V3_GUIDE_TARGETS } from "../src/lib/dashboard-shell/guide-targets.ts";
import {
  DASHBOARD_GUIDE_STEPS,
  PLATFORM_GUIDE_VERSION,
} from "../src/lib/platform-guide.ts";
import {
  DESK_PRIMARY_MODE_IDS,
  modeFromLegacyView,
} from "../src/lib/dashboard-shell/panel-prefs.ts";

test("six destinations defined (Monitor + five legacy)", () => {
  const src = readFileSync(
    join(process.cwd(), "src/lib/dashboard-shell/destinations.ts"),
    "utf8"
  );
  for (const id of ["monitor", "feed", "watchlist", "plan", "risk", "review"]) {
    assert.match(src, new RegExp(`id: \"${id}\"`));
  }
});

test("deep links map legacy panels / Watchtower view", () => {
  assert.equal(modeFromLegacyView("risk"), "structure");
  assert.equal(modeFromLegacyView("dilution"), "structure");
  assert.equal(modeFromLegacyView("watchlist"), "watchlist");
  assert.equal(modeFromLegacyView("portfolio"), "watchlist");
  assert.equal(modeFromLegacyView("watchtower"), "watchtower");
  assert.equal(modeFromLegacyView("discover"), "discover");
  assert.equal(modeFromLegacyView("markets"), "floor");
  assert.equal(modeFromLegacyView("feed"), "floor");
});

test("primary nav IA is Portfolio Watchtower Research Discover", () => {
  assert.deepEqual([...DESK_PRIMARY_MODE_IDS], [
    "watchlist",
    "watchtower",
    "research",
    "discover",
  ]);
});

test("platform guide version bumped for shell v3 / monitor / Watchtower IA", () => {
  assert.ok(PLATFORM_GUIDE_VERSION >= 59);
});

test("each dashboard guide target is unique in steps", () => {
  const targets = DASHBOARD_GUIDE_STEPS.map((s) => s.target).filter(Boolean);
  const counts = new Map<string, number>();
  for (const t of targets) {
    counts.set(t!, (counts.get(t!) ?? 0) + 1);
  }
  for (const [t, n] of counts) {
    assert.equal(n, 1, `data-guide target "${t}" appears ${n} times in guide steps`);
  }
});

test("shell v3 guide target list has unique entries", () => {
  const set = new Set(DASHBOARD_SHELL_V3_GUIDE_TARGETS);
  assert.equal(set.size, DASHBOARD_SHELL_V3_GUIDE_TARGETS.length);
  assert.ok(DASHBOARD_SHELL_V3_GUIDE_TARGETS.includes("watchtower-desk"));
  assert.ok(DASHBOARD_SHELL_V3_GUIDE_TARGETS.includes("discover-desk"));
});

test("feature flag helper is boolean (source)", () => {
  const src = readFileSync(
    join(process.cwd(), "src/lib/dashboard-shell/flags.ts"),
    "utf8"
  );
  assert.match(src, /export function isDashboardShellV3Enabled/);
});
