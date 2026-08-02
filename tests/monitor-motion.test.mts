/**
 * Monitor motion system — tokens, value flash policy, materiality.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  MON_DURATION_CONTROL_MS,
  MON_DURATION_CRITICAL_MS,
  MON_DURATION_INSTANT_MS,
  MON_DURATION_LAYOUT_MS,
  MON_DURATION_PANEL_MS,
  MON_MOTION,
} from "../src/components/monitor/motion/motion-tokens.ts";
import {
  decideValueFlash,
  isMaterialValueChange,
  parseDisplayNumber,
  valueFlashDirection,
} from "../src/components/monitor/motion/live-value-policy.ts";
import {
  FIELD_FRAME_MS,
  FIELD_LERP_MS,
} from "../src/components/monitor/field/field-types.ts";
import {
  DASHBOARD_GUIDE_STEPS,
  PLATFORM_GUIDE_VERSION,
} from "../src/lib/platform-guide.ts";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("motion tokens sit in required bands", () => {
  assert.ok(MON_DURATION_INSTANT_MS >= 80 && MON_DURATION_INSTANT_MS <= 120);
  assert.ok(MON_DURATION_CONTROL_MS >= 120 && MON_DURATION_CONTROL_MS <= 180);
  assert.ok(MON_DURATION_PANEL_MS >= 200 && MON_DURATION_PANEL_MS <= 280);
  assert.ok(MON_DURATION_LAYOUT_MS >= 300 && MON_DURATION_LAYOUT_MS <= 500);
  assert.equal(MON_DURATION_CRITICAL_MS, 0);
  assert.equal(FIELD_FRAME_MS, MON_DURATION_INSTANT_MS);
  assert.equal(FIELD_LERP_MS, MON_DURATION_LAYOUT_MS);
  assert.equal(MON_MOTION.durationPanelMs, MON_DURATION_PANEL_MS);
});

test("CSS tokens declare ease-out / ease-in / spatial / durations", () => {
  const css = readFileSync(
    join(root, "src/components/monitor/design/monitor-tokens.css"),
    "utf8"
  );
  assert.match(css, /--mon-duration-instant:/);
  assert.match(css, /--mon-duration-control:/);
  assert.match(css, /--mon-duration-panel:/);
  assert.match(css, /--mon-duration-layout:/);
  assert.match(css, /--mon-duration-critical:\s*0ms/);
  assert.match(css, /--mon-ease-out:/);
  assert.match(css, /--mon-ease-in:/);
  assert.match(css, /--mon-ease-spatial:/);
  // No bounce overshoot in the spatial curve (second control y ≤ 1)
  assert.doesNotMatch(css, /cubic-bezier\([^)]*,\s*1\.[1-9]/);
});

test("parseDisplayNumber handles market formats", () => {
  assert.equal(parseDisplayNumber("$4.8200"), 4.82);
  assert.equal(parseDisplayNumber("12.5%"), 12.5);
  assert.equal(parseDisplayNumber("3.2x"), 3.2);
  assert.equal(parseDisplayNumber("180 bps"), 180);
  assert.equal(parseDisplayNumber("Unavailable"), null);
});

test("materiality skips noise and keeps real moves", () => {
  assert.equal(isMaterialValueChange("$4.8200", "$4.8200"), false);
  assert.equal(isMaterialValueChange("$4.8200", "$4.8201"), false);
  assert.equal(isMaterialValueChange("$4.82", "$4.95"), true);
  assert.equal(isMaterialValueChange("Unavailable", "$1.00"), true);
  assert.equal(valueFlashDirection("$4.00", "$4.50"), "up");
  assert.equal(valueFlashDirection("$4.50", "$4.00"), "down");
});

test("rapid updates coalesce; critical bypasses once", () => {
  const soft = decideValueFlash({
    baseline: "$4.00",
    previousShown: "$4.00",
    next: "$4.10",
    coalesceElapsedMs: 40,
  });
  assert.equal(soft.shouldFlash, true);
  assert.equal(soft.kind, "up");
  assert.equal(soft.baseline, "$4.00");

  const noise = decideValueFlash({
    baseline: "$4.8200",
    previousShown: "$4.8200",
    next: "$4.8201",
    coalesceElapsedMs: 0,
  });
  assert.equal(noise.shouldFlash, false);

  const critical = decideValueFlash({
    baseline: "ACTIVE",
    previousShown: "ACTIVE",
    next: "HALTED",
    coalesceElapsedMs: 0,
    critical: true,
  });
  assert.equal(critical.kind, "critical");
  assert.equal(critical.shouldFlash, true);
});

test("platform guide mentions connection recovery and value highlight", () => {
  assert.ok(PLATFORM_GUIDE_VERSION >= 47);
  const conn = DASHBOARD_GUIDE_STEPS.find((s) => s.id === "monitor-connection");
  assert.ok(conn?.body.toLowerCase().includes("recovered"));
  const intel = DASHBOARD_GUIDE_STEPS.find((s) => s.id === "monitor-intel");
  assert.ok(intel?.body.toLowerCase().includes("directional"));
});

test("monitor.css ships reduced-motion spatial kill-switch", () => {
  const css = readFileSync(
    join(root, "src/components/monitor/monitor.css"),
    "utf8"
  );
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /tt-monitor__ladder-wrap/);
  assert.match(css, /tt-event-tape__row\[data-enter/);
  assert.match(css, /tt-live-value\[data-flash/);
});
