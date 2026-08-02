import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MONITOR_OPS_CONFIRM,
  applyMonitorOpsControl,
  defaultMonitorOpsControls,
} from "../src/domain/monitor/ops/index.ts";
import {
  allExpansionGatesClear,
  emptyExpansionGates,
  nextRolloutStage,
  resolveMonitorRollout,
  stickyPercentBucket,
  userInRolloutCohort,
} from "../src/domain/monitor/rollout/index.ts";

describe("monitor staged rollout", () => {
  it("sticky bucket is deterministic 0–99", () => {
    const hex = (s: string) => {
      // simple stable stub
      let h = 0;
      for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
      return h.toString(16).padStart(8, "0");
    };
    const a = stickyPercentBucket("user-a", hex);
    const b = stickyPercentBucket("user-a", hex);
    assert.equal(a, b);
    assert.ok(a >= 0 && a < 100);
  });

  it("cohort stages nest membership correctly", () => {
    const base = {
      email: "t@example.com",
      userId: "u1",
      isAdmin: false,
      isTrustedTester: true,
      isFoundingUser: false,
      isEligibleSubscriber: true,
      stickyBucket: 50,
    };
    assert.equal(
      userInRolloutCohort({ ...base, stage: "stage_1_internal_admins" }),
      false
    );
    assert.equal(
      userInRolloutCohort({ ...base, stage: "stage_2_trusted_testers" }),
      true
    );
    assert.equal(
      userInRolloutCohort({
        ...base,
        isTrustedTester: false,
        stickyBucket: 9,
        stage: "stage_4_percent_10",
      }),
      true
    );
    assert.equal(
      userInRolloutCohort({
        ...base,
        isTrustedTester: false,
        stickyBucket: 10,
        stage: "stage_4_percent_10",
      }),
      false
    );
  });

  it("opt-out and rollback deny master access", () => {
    const subsystem = {
      monitorV1: true,
      marketStreamV1: false,
      momentumEngineV1: true,
      priorityEngineV1: true,
      momentumFieldV1: true,
      monitorSquawkV1: true,
      monitorReplayV1: true,
    };
    const denied = resolveMonitorRollout({
      stage: "stage_6_full",
      cohortRaw: "stage_6_full",
      globallyDisabled: false,
      masterEnvEnabled: true,
      subsystemEnv: subsystem,
      optOut: true,
      email: "a@b.com",
      userId: "u",
      isAdmin: false,
      isTrustedTester: false,
      isFoundingUser: false,
      isEligibleSubscriber: true,
      stickyBucket: 0,
    });
    assert.equal(denied.masterEnabled, false);
    assert.equal(denied.reason, "user_opt_out");

    const rolled = resolveMonitorRollout({
      ...denied,
      optOut: false,
      cohortRaw: "monitor-v1-rollback",
      masterEnvEnabled: true,
      subsystemEnv: subsystem,
      stage: "stage_6_full",
      globallyDisabled: false,
      email: "a@b.com",
      userId: "u",
      isAdmin: true,
      isTrustedTester: false,
      isFoundingUser: false,
      isEligibleSubscriber: true,
      stickyBucket: 0,
    });
    assert.equal(rolled.masterEnabled, false);
    assert.equal(rolled.rolledBack, true);
  });

  it("expansion gates must all be clear", () => {
    const g = emptyExpansionGates();
    assert.equal(allExpansionGatesClear(g), false);
    for (const k of Object.keys(g) as Array<keyof typeof g>) g[k] = true;
    assert.equal(allExpansionGatesClear(g), true);
  });

  it("one-click rollback sets global disable + rollback cohort", () => {
    const next = applyMonitorOpsControl(defaultMonitorOpsControls(1), {
      action: "one_click_rollback",
      confirm: MONITOR_OPS_CONFIRM.one_click_rollback,
      nowMs: 2,
    });
    assert.equal(next.controls.monitorGloballyDisabled, true);
    assert.equal(next.controls.featureFlagCohort, "monitor-v1-rollback");
  });

  it("next stage advances 1→2", () => {
    assert.equal(
      nextRolloutStage("stage_1_internal_admins"),
      "stage_2_trusted_testers"
    );
    assert.equal(nextRolloutStage("stage_6_full"), null);
  });
});
