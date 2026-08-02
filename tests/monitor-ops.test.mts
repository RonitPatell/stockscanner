import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MONITOR_OPS_CONFIRM,
  applyMonitorOpsControl,
  defaultMonitorOpsControls,
  sanitizeControls,
  isProviderDisabled,
  isTickerQuarantined,
  MonitorOpsConfirmError,
} from "../src/domain/monitor/ops/index.ts";

describe("monitor ops controls", () => {
  it("requires exact confirm tokens", () => {
    const prev = defaultMonitorOpsControls(1);
    assert.throws(
      () =>
        applyMonitorOpsControl(prev, {
          action: "disable_monitor_global",
          confirm: "yes",
          nowMs: 2,
        }),
      MonitorOpsConfirmError
    );
  });

  it("disables and enables a provider without storing secrets", () => {
    const prev = defaultMonitorOpsControls(1);
    const disabled = applyMonitorOpsControl(prev, {
      action: "disable_provider",
      confirm: MONITOR_OPS_CONFIRM.disable_provider,
      providerId: "Finnhub",
      nowMs: 2,
    });
    assert.equal(isProviderDisabled(disabled.controls, "finnhub"), true);
    assert.deepEqual(disabled.auditDetail.providerId, "finnhub");
    assert.ok(!JSON.stringify(disabled).toLowerCase().includes("api_key"));

    const enabled = applyMonitorOpsControl(disabled.controls, {
      action: "enable_provider",
      confirm: MONITOR_OPS_CONFIRM.enable_provider,
      providerId: "finnhub",
      nowMs: 3,
    });
    assert.equal(isProviderDisabled(enabled.controls, "finnhub"), false);
  });

  it("quarantines tickers and freezes leader selection", () => {
    let c = defaultMonitorOpsControls(1);
    c = applyMonitorOpsControl(c, {
      action: "quarantine_ticker",
      confirm: MONITOR_OPS_CONFIRM.quarantine_ticker,
      symbol: "abcd",
      nowMs: 2,
    }).controls;
    assert.equal(isTickerQuarantined(c, "ABCD"), true);

    c = applyMonitorOpsControl(c, {
      action: "freeze_leader_selection",
      confirm: MONITOR_OPS_CONFIRM.freeze_leader_selection,
      freezeSymbol: "AAAA",
      nowMs: 3,
    }).controls;
    assert.equal(c.leaderSelectionFrozen, true);
    assert.equal(c.frozenLeaderSymbol, "AAAA");
  });

  it("reprocess action does not mutate controls (no silent history rewrite)", () => {
    const prev = sanitizeControls({
      ...defaultMonitorOpsControls(1),
      quarantinedTickers: ["ZZZZ"],
    });
    const next = applyMonitorOpsControl(prev, {
      action: "reprocess_replay_window",
      confirm: MONITOR_OPS_CONFIRM.reprocess_replay_window,
      nowMs: 9,
    });
    assert.deepEqual(next.controls.quarantinedTickers, ["ZZZZ"]);
    assert.match(String(next.auditDetail.note), /immutable|derived/i);
  });

  it("rolls back feature-flag cohort", () => {
    const next = applyMonitorOpsControl(defaultMonitorOpsControls(1), {
      action: "rollback_feature_flag_cohort",
      confirm: MONITOR_OPS_CONFIRM.rollback_feature_flag_cohort,
      cohortId: "monitor-v1-rollback",
      nowMs: 4,
    });
    assert.equal(next.controls.featureFlagCohort, "monitor-v1-rollback");
  });
});
