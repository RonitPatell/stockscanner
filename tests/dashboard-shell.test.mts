/**
 * Dashboard Shell V3 — destinations, deep links, guide target uniqueness.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  destinationFromSearchParams,
  destinationDeepLink,
  DASHBOARD_DESTINATIONS,
  DASHBOARD_SHELL_V3_GUIDE_TARGETS,
  isDashboardShellV3Enabled,
} from "../src/lib/dashboard-shell/index.ts";
import {
  DASHBOARD_GUIDE_STEPS,
  PLATFORM_GUIDE_VERSION,
} from "../src/lib/platform-guide.ts";

test("six destinations defined (Monitor + five legacy)", () => {
  assert.equal(DASHBOARD_DESTINATIONS.length, 6);
  assert.deepEqual(
    DASHBOARD_DESTINATIONS.map((d) => d.id),
    ["monitor", "feed", "watchlist", "plan", "risk", "review"]
  );
});

test("deep links map legacy panels to destinations", () => {
  assert.equal(
    destinationFromSearchParams(new URLSearchParams("view=risk")),
    "risk"
  );
  assert.equal(
    destinationFromSearchParams(new URLSearchParams("panel=dilution")),
    "risk"
  );
  assert.equal(
    destinationFromSearchParams(new URLSearchParams("panel=session-plan")),
    "plan"
  );
  assert.equal(
    destinationFromSearchParams(new URLSearchParams("panel=green-ledger")),
    "review"
  );
  assert.equal(
    destinationFromSearchParams(new URLSearchParams("panel=watchlist")),
    "watchlist"
  );
  assert.equal(
    destinationFromSearchParams(new URLSearchParams("focus=1")),
    "feed"
  );
  assert.equal(
    destinationDeepLink("plan"),
    "/dashboard?view=plan"
  );
});

test("platform guide version bumped for shell v3 / monitor", () => {
  assert.ok(PLATFORM_GUIDE_VERSION >= 41);
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
});

test("feature flag helper is boolean", () => {
  assert.equal(typeof isDashboardShellV3Enabled(), "boolean");
});
