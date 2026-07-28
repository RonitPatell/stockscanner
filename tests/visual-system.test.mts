/**
 * Visual system — badge limit, tokens, gallery contract.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  FEED_COLLAPSED_BADGE_MAX,
  SPACE,
  TYPE,
  VISUAL_SYSTEM_VERSION,
  selectCollapsedContextBadges,
} from "../src/lib/visual-system/index.ts";
import { FEED_V3_COLORS } from "../src/lib/catalyst-feed-v3/version.ts";
import {
  DASHBOARD_GUIDE_STEPS,
  PLATFORM_GUIDE_VERSION,
} from "../src/lib/platform-guide.ts";

test("visual system version + 8px spacing", () => {
  assert.match(VISUAL_SYSTEM_VERSION, /visual-system/);
  assert.equal(SPACE[1], 4);
  assert.equal(SPACE[2], 8);
  assert.equal(SPACE[3], 16);
  assert.equal(SPACE[4], 24);
  assert.equal(TYPE.metadataMin, 12);
  assert.equal(FEED_COLLAPSED_BADGE_MAX, 3);
});

test("collapsed badges capped at three; risk prioritized", () => {
  const withRisk = selectCollapsedContextBadges({
    reactionStageLabel: "Early",
    tradeabilityLabel: "Thin",
    topRiskLabel: "Registered offering",
    verificationLabel: "Verified",
    materialityLabel: "High",
  });
  assert.ok(withRisk.length <= FEED_COLLAPSED_BADGE_MAX);
  assert.equal(withRisk[0]!.id, "risk");
  assert.equal(withRisk.length, 3);
  assert.deepEqual(
    withRisk.map((b) => b.id),
    ["risk", "reaction", "tradeability"]
  );

  const noRisk = selectCollapsedContextBadges({
    reactionStageLabel: "Active",
    tradeabilityLabel: "Liquid",
    topRiskLabel: "No major capital risk",
    verificationLabel: "Verified",
    materialityLabel: "Medium",
  });
  assert.ok(noRisk.length <= 3);
  assert.ok(!noRisk.some((b) => b.id === "risk"));
  assert.ok(noRisk.some((b) => b.id === "reaction"));
});

test("FEED_V3_COLORS use tone utility classes", () => {
  assert.equal(FEED_V3_COLORS.positive.text, "tt-tone-positive");
  assert.equal(FEED_V3_COLORS.negative.text, "tt-tone-negative");
  assert.equal(FEED_V3_COLORS.risk.text, "tt-tone-risk");
  assert.equal(FEED_V3_COLORS.system.text, "tt-tone-system");
  assert.equal(FEED_V3_COLORS.brand.text, "tt-tone-brand");
});

test("platform guide mentions visual gallery (v29+)", () => {
  assert.ok(PLATFORM_GUIDE_VERSION >= 29);
  const step = DASHBOARD_GUIDE_STEPS.find((s) => s.id === "visual-system");
  assert.ok(step);
  assert.equal(step!.target, "visual-system-gallery-link");
});
