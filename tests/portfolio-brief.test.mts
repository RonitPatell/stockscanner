/**
 * Portfolio Brief — empty portfolio, categories, thesis conflicts,
 * entitlement, cross-user isolation (compose + route gates).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  composePortfolioBrief,
  diffThesisEvaluations,
  PORTFOLIO_BRIEF_VERSION,
} from "../src/lib/portfolio-brief/index.ts";
import type {
  BriefEventInput,
  BriefThesisSnapshot,
} from "../src/lib/portfolio-brief/types.ts";
import {
  hasTrustTickerAccess,
  resolveAccessState,
} from "../src/lib/subscription.ts";

const NOW = new Date("2026-08-16T12:00:00.000Z");
const SINCE = new Date("2026-08-09T12:00:00.000Z");

function event(
  partial: Partial<BriefEventInput> & {
    id: string;
    symbol: string;
    title: string;
  }
): BriefEventInput {
  return {
    summary: "Summary",
    category: "filing",
    eventType: "sec_8k",
    significanceLevel: "MEDIUM",
    occurredAt: "2026-08-14T15:00:00.000Z",
    sourceUrl: "https://example.com/s",
    ...partial,
  };
}

test("version exported", () => {
  assert.equal(PORTFOLIO_BRIEF_VERSION, "1.1.0");
});

test("empty portfolio → clear headline, no sections filled", () => {
  const brief = composePortfolioBrief({
    monitoredSymbols: [],
    events: [
      event({
        id: "leak",
        symbol: "AAPL",
        title: "Should not appear",
        significanceLevel: "HIGH",
      }),
    ],
    thesisLatest: [],
    thesisPreviousByThesisId: new Map(),
    since: SINCE,
    until: NOW,
    now: NOW,
  });
  assert.equal(brief.meta.emptyPortfolio, true);
  assert.equal(brief.sections.needsReview.length, 0);
  assert.equal(brief.sections.quietCompanies.length, 0);
  assert.match(brief.headline, /Add companies/i);
});

test("no material events → quiet companies + calm headline", () => {
  const brief = composePortfolioBrief({
    monitoredSymbols: ["AAA", "BBB"],
    events: [
      event({
        id: "low",
        symbol: "AAA",
        title: "Routine 10-Q",
        eventType: "sec_10q",
        significanceLevel: "LOW",
      }),
    ],
    thesisLatest: [],
    thesisPreviousByThesisId: new Map(),
    since: SINCE,
    until: NOW,
    now: NOW,
  });
  assert.equal(brief.sections.needsReview.length, 0);
  assert.deepEqual(brief.sections.quietCompanies.sort(), ["AAA", "BBB"]);
  assert.match(brief.headline, /no material TrustTicker event/i);
});

test("multiple event categories split into Needs Review / Capital / Insiders", () => {
  const brief = composePortfolioBrief({
    monitoredSymbols: ["CAP", "INS", "FIL"],
    events: [
      event({
        id: "c1",
        symbol: "CAP",
        title: "Capital risk elevated",
        category: "capital",
        eventType: "capital_risk_level_change",
        significanceLevel: "MEDIUM",
      }),
      event({
        id: "i1",
        symbol: "INS",
        title: "Insider sale",
        category: "insider",
        eventType: "insider_sale",
        significanceLevel: "HIGH",
      }),
      event({
        id: "f1",
        symbol: "FIL",
        title: "Going concern",
        category: "filing",
        eventType: "sec_10k",
        significanceLevel: "HIGH",
      }),
    ],
    thesisLatest: [],
    thesisPreviousByThesisId: new Map(),
    since: SINCE,
    until: NOW,
    now: NOW,
  });
  assert.equal(brief.sections.needsReview.length, 3);
  assert.equal(brief.sections.capital.length, 1);
  assert.equal(brief.sections.capital[0]!.symbol, "CAP");
  assert.equal(brief.sections.insiders.length, 1);
  assert.equal(brief.sections.insiders[0]!.symbol, "INS");
  assert.equal(brief.sections.quietCompanies.length, 0);
});

test("thesis conflicts surface FAIL transitions", () => {
  const latest: BriefThesisSnapshot = {
    thesisId: "th1",
    symbol: "XYZ",
    evaluatedAt: "2026-08-15T00:00:00.000Z",
    conditions: [
      {
        conditionId: "cond1",
        label: "No ATM",
        polarity: "invalidate_if",
        state: "FAIL",
        mode: "automated",
        explanation: "ATM detected",
      },
    ],
  };
  const previous: BriefThesisSnapshot = {
    thesisId: "th1",
    symbol: "XYZ",
    evaluatedAt: "2026-08-10T00:00:00.000Z",
    conditions: [
      {
        conditionId: "cond1",
        label: "No ATM",
        polarity: "invalidate_if",
        state: "PASS",
        mode: "automated",
      },
    ],
  };
  const changes = diffThesisEvaluations({
    latest: [latest],
    previousByThesisId: new Map([["th1", previous]]),
  });
  assert.equal(changes.length, 1);
  assert.equal(changes[0]!.isConflict, true);
  assert.equal(changes[0]!.fromState, "PASS");
  assert.equal(changes[0]!.toState, "FAIL");

  const brief = composePortfolioBrief({
    monitoredSymbols: ["XYZ"],
    events: [],
    thesisLatest: [latest],
    thesisPreviousByThesisId: new Map([["th1", previous]]),
    since: SINCE,
    until: NOW,
    now: NOW,
  });
  assert.equal(brief.sections.thesisChanges.length, 1);
  assert.equal(brief.sections.thesisChanges[0]!.isConflict, true);
});

test("cross-user isolation: events for non-monitored symbols never appear", () => {
  const brief = composePortfolioBrief({
    monitoredSymbols: ["MINE"],
    events: [
      event({
        id: "other",
        symbol: "OTHER",
        title: "Other user name",
        significanceLevel: "HIGH",
        category: "capital",
      }),
      event({
        id: "mine",
        symbol: "MINE",
        title: "My capital event",
        significanceLevel: "MEDIUM",
        category: "capital",
      }),
    ],
    thesisLatest: [
      {
        thesisId: "th-other",
        symbol: "OTHER",
        evaluatedAt: "2026-08-15T00:00:00.000Z",
        conditions: [
          {
            conditionId: "c",
            label: "Leak",
            polarity: "invalidate_if",
            state: "FAIL",
            mode: "automated",
          },
        ],
      },
    ],
    thesisPreviousByThesisId: new Map([
      [
        "th-other",
        {
          thesisId: "th-other",
          symbol: "OTHER",
          evaluatedAt: "2026-08-10T00:00:00.000Z",
          conditions: [
            {
              conditionId: "c",
              label: "Leak",
              polarity: "invalidate_if",
              state: "PASS",
              mode: "automated",
            },
          ],
        },
      ],
    ]),
    since: SINCE,
    until: NOW,
    now: NOW,
  });
  assert.equal(brief.sections.needsReview.length, 1);
  assert.equal(brief.sections.needsReview[0]!.symbol, "MINE");
  assert.equal(brief.sections.thesisChanges.length, 0);
  assert.deepEqual(brief.sections.quietCompanies, []);
});

test("financial and ownership events land in their sections", () => {
  const brief = composePortfolioBrief({
    monitoredSymbols: ["FIN", "OWN"],
    events: [
      event({
        id: "fin1",
        symbol: "FIN",
        title: "New quarter",
        category: "financial",
        eventType: "metric_observation",
        significanceLevel: "MEDIUM",
      }),
      event({
        id: "own1",
        symbol: "OWN",
        title: "13D",
        category: "ownership",
        eventType: "sec_13d",
        significanceLevel: "HIGH",
      }),
    ],
    thesisLatest: [],
    thesisPreviousByThesisId: new Map(),
    since: SINCE,
    until: NOW,
    now: NOW,
  });
  assert.equal(brief.sections.financial.length, 1);
  assert.equal(brief.sections.ownership.length, 1);
});

test("events before previous-brief cutoff are excluded", () => {
  const brief = composePortfolioBrief({
    monitoredSymbols: ["AAA"],
    events: [
      event({
        id: "old",
        symbol: "AAA",
        title: "Old",
        significanceLevel: "HIGH",
        occurredAt: "2026-08-01T00:00:00.000Z",
      }),
      event({
        id: "new",
        symbol: "AAA",
        title: "New",
        significanceLevel: "HIGH",
        occurredAt: "2026-08-14T00:00:00.000Z",
      }),
    ],
    thesisLatest: [],
    thesisPreviousByThesisId: new Map(),
    since: new Date("2026-08-10T00:00:00.000Z"),
    until: NOW,
    now: NOW,
  });
  assert.equal(brief.sections.needsReview.length, 1);
  assert.equal(brief.sections.needsReview[0]!.id, "new");
});

test("duplicate event ids are suppressed", () => {
  const brief = composePortfolioBrief({
    monitoredSymbols: ["AAA"],
    events: [
      event({
        id: "dup",
        symbol: "AAA",
        title: "Once",
        significanceLevel: "HIGH",
      }),
      event({
        id: "dup",
        symbol: "AAA",
        title: "Twice",
        significanceLevel: "HIGH",
      }),
    ],
    thesisLatest: [],
    thesisPreviousByThesisId: new Map(),
    since: SINCE,
    until: NOW,
    now: NOW,
  });
  assert.equal(brief.sections.needsReview.length, 1);
});

test("expired entitlement is not TrustTicker access", () => {
  const user = {
    subscriptionStatus: "canceled",
    hasUsedTrial: true,
    trialEndsAt: new Date("2026-01-01T00:00:00.000Z"),
  };
  assert.equal(resolveAccessState(user, NOW), "expired");
  assert.equal(hasTrustTickerAccess(user, NOW), false);
});

test("Portfolio Brief API gates with requireTrustTickerAccess and no client userId", () => {
  const src = readFileSync(
    join(process.cwd(), "src/app/api/portfolio/brief/route.ts"),
    "utf8"
  );
  assert.match(src, /requireTrustTickerAccess/);
  assert.doesNotMatch(
    src,
    /body\.userId|query\.userId|searchParams\.get\([\"']userId/
  );
  assert.match(src, /buildPortfolioBrief\(gate\.user\.id/);
});

test("public /today must not import portfolio-brief builder", () => {
  const src = readFileSync(
    join(process.cwd(), "src/app/today/page.tsx"),
    "utf8"
  );
  assert.doesNotMatch(src, /from [\"']@\/lib\/portfolio-brief/);
  assert.doesNotMatch(src, /buildPortfolioBrief/);
  assert.doesNotMatch(src, /from [\"']@\/lib\/portfolio/);
  assert.match(src, /buildSessionPlan/);
  assert.match(src, /Public sample|not personalized/);
});
