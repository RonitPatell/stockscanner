/**
 * Monitor non-ideal state copy & helpers — no infra leaks.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  MONITOR_NO_MATCH_TITLE,
  MONITOR_QUIET_BODY,
  MONITOR_LOADING_SYSTEMS,
  createMonitorDiagnosticId,
  outageCategoriesFromNotes,
  sanitizeProviderNotes,
} from "../src/components/monitor/states/monitor-state-copy.ts";
import { MONITOR_E2E_SCENARIOS } from "../src/components/monitor/e2e-scenarios.ts";
import {
  DASHBOARD_GUIDE_STEPS,
  PLATFORM_GUIDE_VERSION,
} from "../src/lib/platform-guide.ts";

test("quiet and no-match copy stay trustworthy", () => {
  assert.match(MONITOR_QUIET_BODY, /does not invent|artificial/i);
  assert.match(MONITOR_NO_MATCH_TITLE, /No priority tickers match/i);
  assert.ok(MONITOR_LOADING_SYSTEMS.length >= 3);
});

test("sanitizeProviderNotes strips hosts and secret-ish labels", () => {
  const out = sanitizeProviderNotes([
    "News and catalysts degraded",
    "Host worker.internal:8080 failed",
    "api_key rotated",
    "Market quotes delayed",
  ]);
  assert.deepEqual(out, [
    "News and catalysts degraded",
    "Market quotes delayed",
  ]);
});

test("outage categories are user-facing only", () => {
  const cats = outageCategoriesFromNotes([
    "News provider degraded",
    "Quote feed incomplete",
  ]);
  assert.ok(cats.includes("news"));
  assert.ok(cats.includes("quotes"));
  assert.ok(!cats.some((c) => /host|redis|postgres/i.test(c)));
});

test("diagnostic id is support-safe shape", () => {
  const id = createMonitorDiagnosticId(1_700_000_000_000);
  assert.match(id, /^mon_[a-z0-9]+_[a-z0-9]+$/i);
  assert.ok(!id.includes("Error"));
  assert.ok(!id.includes("at "));
});

test("e2e scenarios cover every non-ideal state", () => {
  for (const need of [
    "loading",
    "quiet",
    "no_match",
    "outage",
    "partial_outage",
    "disconnected",
    "error",
  ]) {
    assert.ok(
      (MONITOR_E2E_SCENARIOS as readonly string[]).includes(need),
      need
    );
  }
});

test("platform guide mentions quiet and status", () => {
  assert.ok(PLATFORM_GUIDE_VERSION >= 48);
  const status = DASHBOARD_GUIDE_STEPS.find((s) => s.id === "monitor-status");
  assert.ok(status?.body.toLowerCase().includes("quiet"));
  assert.ok(status?.body.includes("/status"));
});
