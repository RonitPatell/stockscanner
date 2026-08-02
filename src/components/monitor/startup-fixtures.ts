/**
 * Production-representative Monitor startup fixtures for harness + tests.
 * Deterministic seeded snapshots — not live market data.
 */

import {
  buildMonitorPublicSnapshot,
  type MonitorPublicSnapshot,
  type NormalizedSnapshotTickerInput,
} from "../../domain/monitor/snapshot/index.ts";
import type {
  MonitorInitialSnapshot,
  MonitorSnapshotSourceType,
  MonitorUiPreferences,
} from "../../lib/monitor/ssr/types.ts";
import { DEFAULT_MONITOR_UI_PREFS } from "../../lib/monitor/ssr/types.ts";
import {
  buildMonitorE2eSeed,
  type MonitorE2eSeed,
  type MonitorE2eScenarioId,
} from "./e2e-scenarios.ts";
import type { MonitorLadderRow } from "./monitor-types.ts";

export const MONITOR_STARTUP_SCENARIOS = [
  "startup_active",
  "startup_burst",
  "startup_closed",
  "startup_quiet",
  "startup_stale",
  "startup_stream_down",
] as const;

export type MonitorStartupScenarioId =
  (typeof MONITOR_STARTUP_SCENARIOS)[number];

export function isMonitorStartupScenario(
  raw: string | null | undefined
): raw is MonitorStartupScenarioId {
  return (MONITOR_STARTUP_SCENARIOS as readonly string[]).includes(
    (raw ?? "").trim().toLowerCase()
  );
}

const NOW = Date.parse("2026-08-01T14:35:00.000Z");

function ticker(
  symbol: string,
  attention: number,
  extra?: Partial<NormalizedSnapshotTickerInput>
): NormalizedSnapshotTickerInput {
  return {
    symbol,
    attentionPriority: attention,
    momentumIntensity: attention / 100,
    momentumState: attention >= 85 ? "BREAKING" : "BUILDING",
    direction: "up",
    reactionStage: "developing",
    tradeability: "ACCEPTABLE",
    primaryRisk: "none",
    dataConfidence: "HIGH",
    haltState: "none",
    price: 2.5 + attention / 100,
    sessionChangePct: 8 + attention / 20,
    quoteTimestampMs: NOW - 400,
    lastQuoteAtMs: NOW - 400,
    companyShortName: `${symbol} Co`,
    provider: "hub",
    ...extra,
  };
}

function ladderDirection(
  d: MonitorPublicSnapshot["priorityLadder"][number]["direction"] | undefined
): MonitorLadderRow["direction"] {
  if (d === "up" || d === "down" || d === "neutral") return d;
  return "neutral";
}

function ladderFromSnap(snap: MonitorPublicSnapshot): MonitorLadderRow[] {
  return snap.priorityLadder.map((t) => ({
    symbol: t.symbol,
    rank: t.rank ?? 0,
    attentionPriority: t.attentionPriority ?? 0,
    momentumState: t.momentumState ?? "BUILDING",
    momentumIntensity: t.momentumIntensity ?? 0,
    direction: ladderDirection(t.direction),
    tier:
      (t.attentionPriority ?? 0) >= 85
        ? "CRITICAL"
        : (t.attentionPriority ?? 0) >= 70
          ? "HIGH"
          : "MEDIUM",
    reason: `${t.momentumState ?? "Active"} · seeded`,
    onWatchlist: false,
    hasCatalyst: Boolean(t.catalyst),
    catalystVerified: Boolean(t.catalyst?.verified),
    halted: t.haltState === "halted",
  }));
}

function envelope(input: {
  snap: MonitorPublicSnapshot;
  source: MonitorSnapshotSourceType;
  dataAgeMs: number | null;
  prefs?: Partial<MonitorUiPreferences>;
  selectedSymbol?: string | null;
  ok?: boolean;
  error?: MonitorInitialSnapshot["error"];
}): MonitorInitialSnapshot {
  const prefs = { ...DEFAULT_MONITOR_UI_PREFS, ...input.prefs };
  const selected =
    input.selectedSymbol ??
    prefs.pinnedTicker ??
    input.snap.globalLeader ??
    input.snap.priorityLadder[0]?.symbol ??
    null;
  const selectedSummary =
    input.snap.priorityLadder.find((t) => t.symbol === selected) ??
    input.snap.priorityLadder[0] ??
    null;
  return {
    ok: input.ok !== false,
    source: input.source,
    generatedAt: input.snap.generatedAt,
    generatedAtMs: input.snap.generatedAtMs,
    dataAgeMs: input.dataAgeMs,
    lastEventId: input.snap.lastEventId,
    snapshot: input.ok === false ? null : input.snap,
    prefs,
    selectedSymbol: selected,
    selectedSummary,
    error: input.error ?? null,
  };
}

function e2eFromSnap(
  scenario: MonitorE2eScenarioId,
  snap: MonitorPublicSnapshot,
  opts?: {
    connection?: MonitorE2eSeed["viewModel"]["connection"];
    sessionLabel?: string;
    selectedSymbol?: string | null;
    pinnedSymbol?: string | null;
  }
): MonitorE2eSeed {
  const base = buildMonitorE2eSeed(scenario === "quiet" ? "quiet" : "leader");
  const ladder = ladderFromSnap(snap);
  const selected =
    opts?.selectedSymbol ?? ladder[0]?.symbol ?? null;
  return {
    ...base,
    scenario,
    skipLoadDelay: true,
    forceFixture: true,
    selectedSymbol: selected,
    pinnedSymbol: opts?.pinnedSymbol ?? null,
    viewModel: {
      ...base.viewModel,
      connection: opts?.connection ?? "live",
      sessionLabel: opts?.sessionLabel ?? "Regular",
      ladder,
      selectedSymbol: selected,
      lastEventAgeMs: 800,
      providerNotes: [`Startup fixture ${scenario}`],
    },
  };
}

export interface MonitorStartupHarnessSeed {
  scenario: MonitorStartupScenarioId;
  initialSnapshot: MonitorInitialSnapshot;
  e2eSeed: MonitorE2eSeed;
  /** Primary symbol expected in first paint / SSR HTML. */
  expectedTicker: string;
}

/** Build SSR + client harness pair for a startup scenario. */
export function buildMonitorStartupHarness(
  scenario: MonitorStartupScenarioId
): MonitorStartupHarnessSeed {
  switch (scenario) {
    case "startup_active": {
      const snap = buildMonitorPublicSnapshot({
        nowMs: NOW,
        lastEventId: "91001",
        marketSession: "regular",
        tickers: [
          ticker("AAAA", 92),
          ticker("BBBB", 78),
          ticker("CCCC", 64),
        ],
        marketStateAgeMs: 500,
      });
      const initialSnapshot = envelope({
        snap,
        source: "REDIS_FRESH",
        dataAgeMs: 500,
        selectedSymbol: "AAAA",
      });
      return {
        scenario,
        initialSnapshot,
        e2eSeed: e2eFromSnap("leader", snap, {
          connection: "live",
          sessionLabel: "Regular",
          selectedSymbol: "AAAA",
        }),
        expectedTicker: "AAAA",
      };
    }

    case "startup_burst": {
      const snap = buildMonitorPublicSnapshot({
        nowMs: NOW,
        lastEventId: "92050",
        marketSession: "open_auction",
        tickers: [
          ticker("BUR1", 98, {
            momentumState: "BREAKING",
            tradesPerSecond: 12,
            activityLevel: "burst",
          }),
          ticker("BUR2", 94, {
            momentumState: "BREAKING",
            tradesPerSecond: 9,
            activityLevel: "burst",
          }),
          ticker("BUR3", 88, { tradesPerSecond: 6, activityLevel: "burst" }),
          ticker("BUR4", 82, { tradesPerSecond: 5, activityLevel: "active" }),
        ],
        marketStateAgeMs: 200,
      });
      return {
        scenario,
        initialSnapshot: envelope({
          snap,
          source: "REDIS_FRESH",
          dataAgeMs: 200,
          selectedSymbol: "BUR1",
        }),
        e2eSeed: e2eFromSnap("leader", snap, {
          connection: "live",
          sessionLabel: "Open",
          selectedSymbol: "BUR1",
        }),
        expectedTicker: "BUR1",
      };
    }

    case "startup_closed": {
      const snap = buildMonitorPublicSnapshot({
        nowMs: NOW,
        lastEventId: "93010",
        marketSession: "closed",
        tickers: [ticker("AAAA", 70), ticker("BBBB", 55)],
        marketStateAgeMs: 3_600_000,
        recovery: true,
        dataQuality: "degraded",
      });
      return {
        scenario,
        initialSnapshot: envelope({
          snap,
          source: "REDIS_STALE",
          dataAgeMs: 3_600_000,
          selectedSymbol: "AAAA",
        }),
        e2eSeed: e2eFromSnap("outage", snap, {
          connection: "delayed",
          sessionLabel: "Closed",
          selectedSymbol: "AAAA",
        }),
        expectedTicker: "AAAA",
      };
    }

    case "startup_quiet": {
      const snap = buildMonitorPublicSnapshot({
        nowMs: NOW,
        lastEventId: "94001",
        marketSession: "regular",
        tickers: [],
        marketStateAgeMs: 1_000,
        recovery: true,
        dataQuality: "unavailable",
      });
      const initialSnapshot = envelope({
        snap,
        source: "REDIS_FRESH",
        dataAgeMs: 1_000,
        selectedSymbol: null,
      });
      const quiet = buildMonitorE2eSeed("quiet");
      return {
        scenario,
        initialSnapshot,
        e2eSeed: {
          ...quiet,
          skipLoadDelay: true,
          forceFixture: true,
        },
        expectedTicker: "",
      };
    }

    case "startup_stale": {
      const snap = buildMonitorPublicSnapshot({
        nowMs: NOW,
        lastEventId: "95020",
        marketSession: "regular",
        tickers: [
          ticker("STAL", 80, {
            lastQuoteAtMs: NOW - 90_000,
            quoteTimestampMs: NOW - 90_000,
          }),
          ticker("FRES", 70, {
            lastQuoteAtMs: NOW - 400,
            quoteTimestampMs: NOW - 400,
          }),
        ],
        marketStateAgeMs: 90_000,
        dataQuality: "degraded",
      });
      return {
        scenario,
        initialSnapshot: envelope({
          snap,
          source: "REDIS_STALE",
          dataAgeMs: 90_000,
          selectedSymbol: snap.globalLeader ?? "FRES",
        }),
        e2eSeed: e2eFromSnap("partial_outage", snap, {
          connection: "degraded",
          sessionLabel: "Regular",
          selectedSymbol: snap.globalLeader ?? "FRES",
        }),
        expectedTicker: snap.globalLeader ?? "FRES",
      };
    }

    case "startup_stream_down": {
      const snap = buildMonitorPublicSnapshot({
        nowMs: NOW,
        lastEventId: "96011",
        marketSession: "regular",
        tickers: [ticker("AAAA", 88), ticker("BBBB", 72)],
        marketStateAgeMs: 1_200,
      });
      return {
        scenario,
        initialSnapshot: envelope({
          snap,
          source: "REDIS_FRESH",
          dataAgeMs: 1_200,
          selectedSymbol: "AAAA",
        }),
        e2eSeed: e2eFromSnap("disconnected", snap, {
          connection: "disconnected",
          sessionLabel: "Regular",
          selectedSymbol: "AAAA",
        }),
        expectedTicker: "AAAA",
      };
    }

    default: {
      const _x: never = scenario;
      throw new Error(`Unknown startup scenario ${_x}`);
    }
  }
}

/** Postgres-fallback envelope for integration / authenticated SSR tests. */
export function buildPostgresFallbackStartupSeed(): MonitorStartupHarnessSeed {
  const base = buildMonitorStartupHarness("startup_active");
  return {
    ...base,
    initialSnapshot: {
      ...base.initialSnapshot,
      source: "POSTGRES_FALLBACK",
      dataAgeMs: 12_000,
    },
  };
}
