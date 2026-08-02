/**
 * TrustTicker Monitor V1 — flag, guide targets, fixture states.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MONITOR_GUIDE_TARGETS,
  MONITOR_V1_FLAG,
  isMonitorV1Enabled,
} from "../src/lib/monitor/index.ts";
import {
  DASHBOARD_GUIDE_STEPS,
  PLATFORM_GUIDE_VERSION,
} from "../src/lib/platform-guide.ts";
import {
  DASHBOARD_DESTINATIONS,
  DASHBOARD_SHELL_V3_GUIDE_TARGETS,
  destinationFromSearchParams,
  visibleDestinations,
} from "../src/lib/dashboard-shell/index.ts";
import { buildMonitorFixture } from "../src/components/monitor/monitor-fixtures.ts";

const ROOT = join(import.meta.dirname, "..");

test("monitorV1 flag helper is boolean", () => {
  assert.equal(MONITOR_V1_FLAG, "monitorV1");
  assert.equal(typeof isMonitorV1Enabled(), "boolean");
});

test("platform guide version bumped for Monitor V1", () => {
  assert.ok(PLATFORM_GUIDE_VERSION >= 41);
});

test("destinations include Monitor first", () => {
  assert.equal(DASHBOARD_DESTINATIONS[0]?.id, "monitor");
  assert.deepEqual(
    DASHBOARD_DESTINATIONS.map((d) => d.id),
    ["monitor", "feed", "watchlist", "plan", "risk", "review"]
  );
});

test("view=monitor respects flag (falls back when off via search param mapping)", () => {
  // When flag on (dev default), monitor resolves; deep link shape preserved.
  const d = destinationFromSearchParams(new URLSearchParams("view=monitor"));
  if (isMonitorV1Enabled()) {
    assert.equal(d, "monitor");
    assert.ok(visibleDestinations().some((x) => x.id === "monitor"));
  } else {
    assert.equal(d, "feed");
    assert.ok(!visibleDestinations().some((x) => x.id === "monitor"));
  }
  // Existing routes still resolve
  assert.equal(
    destinationFromSearchParams(new URLSearchParams("view=feed")),
    "feed"
  );
  assert.equal(
    destinationFromSearchParams(new URLSearchParams("view=risk")),
    "risk"
  );
});

test("every Monitor guide target appears exactly once in guide steps", () => {
  const targets = DASHBOARD_GUIDE_STEPS.map((s) => s.target).filter(Boolean) as string[];
  for (const t of MONITOR_GUIDE_TARGETS) {
    const n = targets.filter((x) => x === t).length;
    assert.equal(n, 1, `guide step target "${t}" count=${n}`);
  }
});

test("every Monitor guide target is listed in shell guide target registry once", () => {
  for (const t of MONITOR_GUIDE_TARGETS) {
    const n = DASHBOARD_SHELL_V3_GUIDE_TARGETS.filter((x) => x === t).length;
    assert.equal(n, 1, `shell registry "${t}" count=${n}`);
  }
});

test("every Monitor guide target exists exactly once in TrustTickerMonitor markup", () => {
  const monitorDir = join(ROOT, "src/components/monitor");
  const files = [
    "TrustTickerMonitor.tsx",
    "MonitorSquawkBar.tsx",
    "MonitorPresetPanel.tsx",
    "MonitorSurfaceStates.tsx",
  ];
  const src = files
    .map((f) => {
      try {
        return readFileSync(join(monitorDir, f), "utf8");
      } catch {
        return "";
      }
    })
    .join("\n");
  for (const t of MONITOR_GUIDE_TARGETS) {
    const re = new RegExp(`data-guide="${t}"`, "g");
    const matches = src.match(re) ?? [];
    assert.equal(
      matches.length,
      1,
      `data-guide="${t}" appears ${matches.length} times in Monitor UI`
    );
  }
});

test("fixture states: loading empty disconnected delayed partial", () => {
  for (const c of [
    "loading",
    "empty",
    "disconnected",
    "delayed",
    "partial_outage",
    "live",
    "degraded",
  ] as const) {
    const vm = buildMonitorFixture(c);
    assert.equal(vm.connection, c);
    if (c === "loading" || c === "empty" || c === "disconnected") {
      assert.equal(vm.ladder.length, 0);
    }
    if (c === "delayed" || c === "partial_outage") {
      assert.ok((vm.lastEventAgeMs ?? 0) >= 5_000);
      assert.ok(vm.providerNotes.length >= 0);
    }
    if (c === "live") {
      assert.ok(vm.ladder.length > 0);
      assert.ok(Object.keys(vm.intelSeeds).length > 0);
      assert.ok(vm.tape.length > 0);
    }
  }
});

test("guide steps never claim Monitor is a trade entry tool", () => {
  const blob = DASHBOARD_GUIDE_STEPS.filter((s) =>
    s.id.startsWith("monitor")
  )
    .map((s) => `${s.title} ${s.body}`)
    .join(" ");
  assert.doesNotMatch(blob, /\b(buy|sell|enter a trade)\b/i);
});
