/**
 * Focus Mode V2 — priority ranking (no padding), flag, version.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  FOCUS_MAX_ACTIVE,
  FOCUS_MODE_V2_VERSION,
  FOCUS_PRIORITY_SCORE_FLOOR,
  isFocusModeV2Enabled,
  qualifiesForFocusPriority,
  rankForFocusMode,
  selectFocusPriority,
} from "../src/lib/focus-mode/index.ts";
import { PLATFORM_GUIDE_VERSION, DASHBOARD_GUIDE_STEPS } from "../src/lib/platform-guide.ts";
import type { CatalystItem } from "../src/types/index.ts";

function item(
  over: Partial<CatalystItem> & Pick<CatalystItem, "id" | "symbol">
): CatalystItem {
  return {
    headline: "Test",
    source: "Wire",
    publishedAt: new Date().toISOString(),
    urgencyScore: 10,
    verifiedConfidence: 20,
    changePercent: 1,
    ...over,
  };
}

test("focus v2 flag is boolean + version", () => {
  assert.equal(typeof isFocusModeV2Enabled(), "boolean");
  assert.match(FOCUS_MODE_V2_VERSION, /focus-mode-v2/);
  assert.ok(PLATFORM_GUIDE_VERSION >= 29);
});

test("platform guide includes three Focus Mode steps", () => {
  const focusSteps = DASHBOARD_GUIDE_STEPS.filter((s) =>
    s.id.startsWith("focus-")
  );
  assert.equal(focusSteps.length, 3);
  assert.deepEqual(
    focusSteps.map((s) => s.id),
    ["focus-enter", "focus-row", "focus-exit"]
  );
});

test("selectFocusPriority never pads with low-quality to reach five", () => {
  const now = Date.now();
  const weak = Array.from({ length: 12 }, (_, i) =>
    item({
      id: `weak-${i}`,
      symbol: `W${i}`,
      publishedAt: new Date(now - 10 * 3600_000).toISOString(),
      urgencyScore: 5,
      verifiedConfidence: 10,
      changePercent: 0.2,
    })
  );
  const strong = item({
    id: "strong",
    symbol: "NVDA",
    publishedAt: new Date(now - 3 * 60_000).toISOString(),
    urgencyScore: 80,
    verifiedConfidence: 85,
    changePercent: 8,
  });
  const picked = selectFocusPriority([strong, ...weak], {
    watchlist: [],
    nowMs: now,
    ruleMatchedIds: new Set(["strong"]),
  });
  assert.ok(picked.length <= FOCUS_MAX_ACTIVE);
  assert.ok(picked.length >= 1);
  assert.equal(picked[0].id, "strong");
  // Weak stale names must not fill the board
  assert.ok(picked.length < 5 || picked.every((c) => c.id === "strong" || c.urgencyScore! >= 40));
});

test("qualifiesForFocusPriority requires signal or score floor", () => {
  const low: ReturnType<typeof rankForFocusMode>[0] = {
    catalystId: "x",
    symbol: "X",
    score: 10,
    reasons: ["fresh"],
    profitabilityNotUsed: true,
  };
  assert.equal(qualifiesForFocusPriority(low), false);
  assert.equal(
    qualifiesForFocusPriority({
      ...low,
      score: FOCUS_PRIORITY_SCORE_FLOOR,
    }),
    true
  );
  assert.equal(
    qualifiesForFocusPriority({
      ...low,
      score: 20,
      reasons: ["watchlist_match"],
    }),
    true
  );
});

test("ranking never uses predicted profitability", () => {
  const ranked = rankForFocusMode(
    [
      item({ id: "a", symbol: "A" }),
      item({ id: "b", symbol: "B" }),
    ],
    { watchlist: ["A"] }
  );
  assert.ok(ranked.every((r) => r.profitabilityNotUsed === true));
});
