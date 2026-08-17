/**
 * Watchtower UI helpers — filters, labels, visit counts (no DOM).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  WATCHTOWER_FEED_FILTERS,
  buildWatchtowerQuery,
  countNewSince,
  countRequiringReview,
  eventIdFromSearchParams,
  formatEventWhen,
  reasonCodeLabel,
  significanceDisplay,
} from "../src/lib/watchtower/ui.ts";
import {
  DESK_PRIMARY_MODE_IDS,
  modeFromLegacyView,
  viewParamForDeskMode,
} from "../src/lib/dashboard-shell/panel-prefs.ts";
import {
  DASHBOARD_GUIDE_STEPS,
  PLATFORM_GUIDE_VERSION,
} from "../src/lib/platform-guide.ts";
import type { WatchtowerEventDto } from "../src/lib/watchtower/types.ts";

function fakeEvent(
  partial: Partial<WatchtowerEventDto> & { id: string }
): WatchtowerEventDto {
  return {
    symbol: "AAPL",
    companyName: null,
    category: "capital",
    eventType: "shelf_registration",
    severity: "material",
    title: "Shelf",
    summary: "Summary",
    occurredAt: "2026-08-10T00:00:00.000Z",
    detectedAt: "2026-08-10T00:00:00.000Z",
    significance: {
      level: "MEDIUM",
      reasonCodes: ["NEW_SHELF_REGISTRATION"],
      evidence: [],
      engineVersion: "1.0.0",
      thesisRelevance: null,
    },
    source: { type: "sec", id: null, url: null },
    evidence: {},
    thesisRelevance: null,
    readState: {
      isRead: false,
      readAt: null,
      isDismissed: false,
      dismissedAt: null,
    },
    ...partial,
  };
}

test("primary nav is Portfolio · Watchtower · Research · Discover", () => {
  assert.deepEqual([...DESK_PRIMARY_MODE_IDS], [
    "watchlist",
    "watchtower",
    "research",
    "discover",
  ]);
  assert.equal(modeFromLegacyView("watchtower"), "watchtower");
  assert.equal(modeFromLegacyView("discover"), "discover");
  assert.equal(modeFromLegacyView("markets"), "floor");
  assert.equal(viewParamForDeskMode("watchtower"), "watchtower");
  assert.equal(viewParamForDeskMode("watchlist"), "portfolio");
});

test("platform guide includes Watchtower and Discover; version >= 59", () => {
  assert.ok(PLATFORM_GUIDE_VERSION >= 59);
  const targets = DASHBOARD_GUIDE_STEPS.map((s) => s.target).filter(Boolean);
  assert.ok(targets.includes("watchtower-desk"));
  assert.ok(targets.includes("discover-desk"));
  const nav = DASHBOARD_GUIDE_STEPS.find((s) => s.id === "secondary-nav");
  assert.ok(nav?.body.includes("Watchtower"));
  assert.ok(nav?.body.includes("Discover"));
  assert.ok(!nav?.body.includes("Markets · Structure"));
});

test("feed filters cover required chips", () => {
  const ids = WATCHTOWER_FEED_FILTERS.map((f) => f.id);
  assert.deepEqual(ids, [
    "all",
    "high",
    "capital",
    "financial",
    "insider",
    "ownership",
    "management",
    "filings",
  ]);
  assert.match(buildWatchtowerQuery("high"), /significance=HIGH/);
  assert.match(buildWatchtowerQuery("filings"), /category=filing/);
  assert.match(buildWatchtowerQuery("all", { limit: 10 }), /limit=10/);
});

test("summary counters for review and new-since", () => {
  const items = [
    fakeEvent({
      id: "1",
      significance: {
        level: "HIGH",
        reasonCodes: ["GOING_CONCERN"],
        evidence: [],
        engineVersion: "1.0.0",
        thesisRelevance: null,
      },
      detectedAt: "2026-08-16T12:00:00.000Z",
    }),
    fakeEvent({
      id: "2",
      significance: {
        level: "LOW",
        reasonCodes: [],
        evidence: [],
        engineVersion: "1.0.0",
        thesisRelevance: null,
      },
      detectedAt: "2026-08-01T00:00:00.000Z",
      readState: {
        isRead: true,
        readAt: "2026-08-02T00:00:00.000Z",
        isDismissed: false,
        dismissedAt: null,
      },
    }),
  ];
  assert.equal(countRequiringReview(items), 1);
  assert.equal(countNewSince(items, "2026-08-15T00:00:00.000Z"), 1);
  assert.equal(countNewSince(items, null), 1);
});

test("labels stay non-alarmist", () => {
  assert.equal(significanceDisplay("HIGH"), "High");
  assert.equal(reasonCodeLabel("GOING_CONCERN"), "Going-concern language");
  assert.match(formatEventWhen("2026-08-16T11:50:00.000Z", Date.parse("2026-08-16T12:00:00.000Z")), /10m/);
});

test("eventId deep-link parsing", () => {
  assert.equal(
    eventIdFromSearchParams(new URLSearchParams("eventId=abc123")),
    "abc123"
  );
  assert.equal(
    eventIdFromSearchParams(new URLSearchParams("weid=xyz")),
    "xyz"
  );
  assert.equal(eventIdFromSearchParams(new URLSearchParams("")), null);
});

test("Watchtower UI and shell gate strings", () => {
  const desk = readFileSync(
    join(process.cwd(), "src/components/dashboard-shell/WatchtowerDesk.tsx"),
    "utf8"
  );
  assert.match(desk, /Mark as read|markRead|watchtower-mark-read/);
  assert.match(desk, /View source/);
  assert.match(desk, /Material changes across the companies you monitor/);
  assert.doesNotMatch(desk, /buy recommendation|sell signal|guaranteed return/i);

  const bar = readFileSync(
    join(process.cwd(), "src/components/dashboard-shell/DashboardPanelBar.tsx"),
    "utf8"
  );
  assert.match(bar, /DESK_PRIMARY_MODE_IDS/);
  assert.match(bar, /panel-toggle-\$\{id\}|panel-toggle-portfolio/);
  assert.doesNotMatch(bar, /panel-toggle-markets/);
  assert.doesNotMatch(bar, /"panel-toggle-structure"/);

  const shell = readFileSync(
    join(process.cwd(), "src/components/dashboard-shell/DashboardShellV3.tsx"),
    "utf8"
  );
  assert.match(shell, /WatchtowerDesk/);
  assert.match(shell, /DiscoverDesk/);
  assert.match(shell, /deskMode === \"watchtower\"/);
});
