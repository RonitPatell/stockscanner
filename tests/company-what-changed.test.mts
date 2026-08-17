/**
 * Company What Changed — windows, routine filter, thesis overlay, public strip.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCompanyWhatChangedFeed,
  isRoutineActivity,
  resolveWhatChangedSince,
  scoreThesisRelevance,
  startOfCalendarQuarter,
  PUBLIC_PREVIEW_LIMIT,
} from "../src/lib/ticker-what-changed/index.ts";
import type { EventRowForWhatChanged } from "../src/lib/ticker-what-changed/types.ts";

function ev(
  partial: Partial<EventRowForWhatChanged> & {
    id: string;
    eventType: string;
    title: string;
  }
): EventRowForWhatChanged {
  return {
    symbol: "TEST",
    category: partial.category ?? "filing",
    severity: "notable",
    summary: partial.summary ?? "Summary",
    occurredAt: partial.occurredAt ?? new Date("2024-06-15T12:00:00Z"),
    detectedAt: partial.detectedAt ?? new Date("2024-06-15T12:00:00Z"),
    sourceType: "sec",
    sourceId: "acc-1",
    sourceUrl: "https://example.com/filing",
    evidenceJson: partial.evidenceJson ?? {},
    ...partial,
  };
}

test("resolveWhatChangedSince: 7d / 30d / 1y / quarter", () => {
  const now = new Date("2024-08-15T12:00:00Z");
  const d7 = resolveWhatChangedSince({ window: "7d", now });
  assert.equal(
    d7.since!.toISOString(),
    new Date(now.getTime() - 7 * 86400000).toISOString()
  );

  const d30 = resolveWhatChangedSince({ window: "30d", now });
  assert.equal(
    d30.since!.toISOString(),
    new Date(now.getTime() - 30 * 86400000).toISOString()
  );

  const y = resolveWhatChangedSince({ window: "1y", now });
  assert.equal(
    y.since!.toISOString(),
    new Date(now.getTime() - 365 * 86400000).toISOString()
  );

  const q = resolveWhatChangedSince({ window: "quarter", now });
  assert.equal(q.since!.toISOString(), startOfCalendarQuarter(now).toISOString());
  assert.equal(q.usedFallbackWindow, false);
});

test("since_last_view uses lastViewIso; falls back to 30d when missing", () => {
  const now = new Date("2024-08-15T12:00:00Z");
  const ok = resolveWhatChangedSince({
    window: "since_last_view",
    now,
    lastViewIso: "2024-08-10T00:00:00Z",
  });
  assert.equal(ok.usedFallbackWindow, false);
  assert.equal(ok.since!.toISOString(), "2024-08-10T00:00:00.000Z");

  const fb = resolveWhatChangedSince({
    window: "since_last_view",
    now,
    lastViewIso: null,
  });
  assert.equal(fb.usedFallbackWindow, true);
  assert.equal(fb.fallbackWindow, "30d");
});

test("routine 10-Q is routine; going-concern elevated 10-Q is not", () => {
  assert.equal(
    isRoutineActivity({
      eventType: "sec_10q",
      significanceLevel: "LOW",
      reasonCodes: ["ROUTINE_PERIODIC_FILING"],
    }),
    true
  );
  assert.equal(
    isRoutineActivity({
      eventType: "sec_10q",
      significanceLevel: "HIGH",
      reasonCodes: ["ROUTINE_PERIODIC_FILING", "GOING_CONCERN"],
    }),
    false
  );
  assert.equal(
    isRoutineActivity({
      eventType: "filing_section_change",
      significanceLevel: "MEDIUM",
      reasonCodes: ["FILING_SECTION_CHANGE"],
    }),
    false
  );
  assert.equal(
    isRoutineActivity({
      eventType: "capital_risk_level_change",
      significanceLevel: "MEDIUM",
      reasonCodes: ["CAPITAL_RISK_LEVEL_CHANGE"],
    }),
    false
  );
});

test("default feed hides routine filings; show all reveals them", () => {
  const events = [
    ev({
      id: "1",
      eventType: "sec_10q",
      title: "10-Q filed",
      evidenceJson: {
        significance: {
          level: "LOW",
          reasonCodes: ["ROUTINE_PERIODIC_FILING"],
          evidence: [],
        },
      },
    }),
    ev({
      id: "2",
      eventType: "capital_risk_level_change",
      category: "capital",
      title: "Capital risk elevated",
      evidenceJson: {
        significance: {
          level: "MEDIUM",
          reasonCodes: ["CAPITAL_RISK_LEVEL_CHANGE"],
          evidence: [],
        },
      },
    }),
  ];

  const meaningful = buildCompanyWhatChangedFeed({
    symbol: "TEST",
    events,
    window: "30d",
    since: new Date("2024-01-01"),
    until: new Date("2024-12-31"),
    showAllActivity: false,
    accessMode: "public",
    usedFallbackWindow: false,
    fallbackWindow: null,
  });
  assert.equal(meaningful.cards.length, 1);
  assert.equal(meaningful.cards[0]!.eventType, "capital_risk_level_change");
  assert.equal(meaningful.meta.routineHiddenCount, 1);
  assert.ok(meaningful.cards.every((c) => c.thesisRelevance === null));

  const all = buildCompanyWhatChangedFeed({
    symbol: "TEST",
    events,
    window: "30d",
    since: new Date("2024-01-01"),
    until: new Date("2024-12-31"),
    showAllActivity: true,
    accessMode: "public",
    usedFallbackWindow: false,
    fallbackWindow: null,
  });
  assert.equal(all.cards.length, 2);
});

test("empty meaningful window says so clearly", () => {
  const events = [
    ev({
      id: "1",
      eventType: "sec_10k",
      title: "10-K filed",
      evidenceJson: {
        significance: {
          level: "LOW",
          reasonCodes: ["ROUTINE_PERIODIC_FILING"],
          evidence: [],
        },
      },
    }),
  ];
  const feed = buildCompanyWhatChangedFeed({
    symbol: "ABC",
    events,
    window: "7d",
    since: new Date(),
    until: new Date(),
    showAllActivity: false,
    accessMode: "public",
    usedFallbackWindow: false,
    fallbackWindow: null,
  });
  assert.equal(feed.empty, true);
  assert.match(feed.emptyMessage, /Nothing meaningful changed/i);
  assert.match(feed.emptyMessage, /Show all activity/i);
});

test("public mode strips thesis even if conditions provided", () => {
  const events = [
    ev({
      id: "1",
      eventType: "atm_program",
      category: "capital",
      title: "ATM detected",
      evidenceJson: {
        significance: {
          level: "MEDIUM",
          reasonCodes: ["ATM_PROGRAM_DETECTED"],
          evidence: [],
        },
      },
    }),
  ];
  const feed = buildCompanyWhatChangedFeed({
    symbol: "TEST",
    events,
    window: "30d",
    since: new Date(),
    until: new Date(),
    showAllActivity: false,
    accessMode: "public",
    usedFallbackWindow: false,
    fallbackWindow: null,
    thesisConditions: [
      {
        id: "c1",
        conditionType: "NO_EVENT_TYPE",
        label: "No ATM",
        polarity: "invalidate_if",
        params: { eventType: "atm_program" },
      },
    ],
  });
  assert.equal(feed.cards[0]!.thesisRelevance, null);
  assert.equal(feed.meta.hasThesis, false);
  assert.equal(feed.meta.accessMode, "public");
});

test("entitled mode attaches thesis relevance without private note text", () => {
  const events = [
    ev({
      id: "1",
      eventType: "atm_program",
      category: "capital",
      title: "ATM detected",
      evidenceJson: {
        significance: {
          level: "MEDIUM",
          reasonCodes: ["ATM_PROGRAM_DETECTED"],
          evidence: [],
        },
      },
    }),
  ];
  const feed = buildCompanyWhatChangedFeed({
    symbol: "TEST",
    events,
    window: "30d",
    since: new Date(),
    until: new Date(),
    showAllActivity: false,
    accessMode: "entitled",
    usedFallbackWindow: false,
    fallbackWindow: null,
    thesisConditions: [
      {
        id: "c1",
        conditionType: "NO_EVENT_TYPE",
        label: "No ATM",
        polarity: "invalidate_if",
        params: { eventType: "atm_program" },
      },
    ],
  });
  const tr = feed.cards[0]!.thesisRelevance;
  assert.ok(tr);
  assert.equal(tr!.status, "matches_condition");
  assert.equal(tr!.conditionId, "c1");
  assert.match(tr!.summary, /no atm_program/i);
  assert.doesNotMatch(tr!.summary, /premise|secret|I believe/i);
  assert.equal(feed.meta.hasThesis, true);
});

test("scoreThesisRelevance: capital risk condition", () => {
  const r = scoreThesisRelevance({
    event: {
      eventType: "capital_risk_level_change",
      category: "capital",
      title: "Elevated",
    },
    conditions: [
      {
        id: "c2",
        conditionType: "CAPITAL_RISK_NOT_ABOVE",
        label: "Keep capital risk moderate",
        polarity: "risk_if",
        params: { maxStatus: "moderate" },
      },
    ],
  });
  assert.equal(r.status, "matches_condition");
});

test("cards expose WHAT/WHEN/CATEGORY/SIGNIFICANCE/WHAT CHANGED/SOURCE fields", () => {
  const feed = buildCompanyWhatChangedFeed({
    symbol: "TEST",
    events: [
      ev({
        id: "x",
        eventType: "insider_sale",
        category: "insider",
        title: "Insider open-market sale",
        summary: "Form 4 disposition coded as sale",
        evidenceJson: {
          significance: {
            level: "MEDIUM",
            reasonCodes: ["INSIDER_OPEN_MARKET_SALE"],
            evidence: [],
          },
        },
      }),
    ],
    window: "30d",
    since: new Date(),
    until: new Date(),
    showAllActivity: false,
    accessMode: "public",
    usedFallbackWindow: false,
    fallbackWindow: null,
  });
  const c = feed.cards[0]!;
  assert.ok(c.whatHappened);
  assert.ok(c.when);
  assert.ok(c.category);
  assert.ok(c.significance);
  assert.ok(c.whatChanged);
  assert.ok(c.source);
  assert.equal(c.thesisRelevance, null);
});

test("public preview caps card count", () => {
  const events = Array.from({ length: 20 }, (_, i) =>
    ev({
      id: `e${i}`,
      eventType: "shelf_registration",
      category: "capital",
      title: `Shelf ${i}`,
      occurredAt: new Date(Date.UTC(2024, 5, i + 1)),
      evidenceJson: {
        significance: {
          level: "MEDIUM",
          reasonCodes: ["NEW_SHELF_REGISTRATION"],
          evidence: [],
        },
      },
    })
  );
  const feed = buildCompanyWhatChangedFeed({
    symbol: "TEST",
    events,
    window: "1y",
    since: new Date("2024-01-01"),
    until: new Date("2024-12-31"),
    showAllActivity: false,
    accessMode: "public",
    usedFallbackWindow: false,
    fallbackWindow: null,
  });
  assert.equal(feed.cards.length, PUBLIC_PREVIEW_LIMIT);
  assert.equal(feed.meta.previewCapped, true);
});
