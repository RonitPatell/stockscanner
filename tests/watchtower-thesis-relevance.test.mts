/**
 * Same CompanyEvent can have different thesis relevance for different users.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { overlayWatchtowerThesisRelevance } from "../src/lib/watchtower/thesis-overlay.ts";
import { applyWatchtowerClientFilter } from "../src/lib/watchtower/thesis-overlay.ts";
import type { WatchtowerEventDto } from "../src/lib/watchtower/types.ts";

const event = {
  eventType: "sec_s3",
  category: "capital",
  title: "S-3 shelf registration",
};

test("financing watcher vs growth watcher score the same S-3 differently", () => {
  const financingUser = overlayWatchtowerThesisRelevance({
    event,
    conditions: [
      {
        id: "c-fin",
        conditionType: "NO_EVENT_TYPE",
        label: "No new financing registration",
        polarity: "invalidate_if",
        params: { eventType: "sec_s3" },
      },
    ],
  });
  const growthUser = overlayWatchtowerThesisRelevance({
    event,
    conditions: [
      {
        id: "c-rev",
        conditionType: "METRIC_GROWTH_ABOVE",
        label: "Revenue growth >25%",
        polarity: "support_if",
        params: { metricKey: "revenue", threshold: 25, period: "yoy" },
      },
    ],
  });
  assert.equal(financingUser.status, "matches_condition");
  assert.equal(financingUser.conditionId, "c-fin");
  assert.equal(growthUser.status, "none");
});

test("needs_review filter includes thesis invalidate matches", () => {
  const items: WatchtowerEventDto[] = [
    {
      id: "e1",
      symbol: "RKLB",
      companyName: null,
      category: "capital",
      eventType: "sec_s3",
      severity: "notable",
      title: "S-3",
      summary: null,
      occurredAt: "2026-08-01T00:00:00.000Z",
      detectedAt: "2026-08-01T00:00:00.000Z",
      significance: {
        level: "MEDIUM",
        reasonCodes: [],
        evidence: [],
        engineVersion: "1",
        thesisRelevance: null,
      },
      source: { type: "sec", id: null, url: null },
      evidence: {},
      thesisRelevance: {
        status: "matches_condition",
        conditionId: "c1",
        conditionLabel: "No new financing registration",
        polarity: "invalidate_if",
        summary: "Matches",
      },
      readState: {
        isRead: false,
        readAt: null,
        isDismissed: false,
        dismissedAt: null,
      },
    },
  ];
  const review = applyWatchtowerClientFilter(items, "needs_review");
  const relevant = applyWatchtowerClientFilter(items, "thesis_relevant");
  assert.equal(review.length, 1);
  assert.equal(relevant.length, 1);
});
