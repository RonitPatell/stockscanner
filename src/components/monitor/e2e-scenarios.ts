/**
 * Deterministic Monitor E2E scenarios (seeded / replayed — not live market data).
 */

import type { MonitorViewModel, MonitorLadderRow } from "./monitor-types.ts";
import { buildFixtureIntelSeeds } from "./selected-ticker/selected-ticker-seeds.ts";
import { buildFixtureTapeSync } from "./event-tape/tape-fixtures.ts";
import type { SelectedTickerSeed } from "./selected-ticker/build-selected-ticker.ts";

export const MONITOR_E2E_SCENARIOS = [
  "quiet",
  "loading",
  "no_match",
  "emerging",
  "catalyst",
  "leader",
  "pinned",
  "spread",
  "halt",
  "outage",
  "partial_outage",
  "disconnected",
  "error",
  "recovered",
] as const;

export type MonitorE2eScenarioId = (typeof MONITOR_E2E_SCENARIOS)[number];

export interface MonitorE2eSeed {
  scenario: MonitorE2eScenarioId;
  viewModel: MonitorViewModel;
  pinnedSymbol?: string | null;
  selectedSymbol?: string | null;
  /** When set, auto-select follows this until user pins. */
  autoSelectLeader?: boolean;
  skipLoadDelay?: boolean;
  forceFixture?: boolean;
  /** Expected squawk fire count after mount for this scene */
  expectSquawkFires?: number;
  previousLeaderSymbol?: string | null;
  /** Stable support reference for error scene (avoids SSR hydration drift). */
  diagnosticId?: string;
}

const FIXED_NOW = Date.parse("2026-08-01T14:35:00.000Z");

function row(
  partial: Partial<MonitorLadderRow> &
    Pick<
      MonitorLadderRow,
      "symbol" | "rank" | "attentionPriority" | "momentumState" | "momentumIntensity" | "reason"
    >
): MonitorLadderRow {
  return {
    direction: "neutral",
    tier: "LOW",
    onWatchlist: false,
    ...partial,
  };
}

function baseVm(
  over: Partial<MonitorViewModel> & Pick<MonitorViewModel, "connection" | "ladder">
): MonitorViewModel {
  return {
    lastEventAgeMs: 1_200,
    sessionLabel: "Regular",
    filterPreset: "all",
    selectedSymbol: over.ladder[0]?.symbol ?? null,
    intelSeeds: buildFixtureIntelSeeds(over.connection, FIXED_NOW),
    tape: buildFixtureTapeSync(FIXED_NOW - 2_000),
    providerNotes: [],
    ...over,
  };
}

/** Scene builders — pure, deterministic. */
export function buildMonitorE2eSeed(scenario: MonitorE2eScenarioId): MonitorE2eSeed {
  switch (scenario) {
    case "quiet":
      return {
        scenario,
        skipLoadDelay: true,
        forceFixture: true,
        viewModel: baseVm({
          connection: "empty",
          ladder: [],
          selectedSymbol: null,
          intelSeeds: {},
          tape: [],
          providerNotes: ["Market open — no priority names yet."],
          lastEventAgeMs: null,
        }),
      };

    case "loading":
      return {
        scenario,
        skipLoadDelay: true,
        forceFixture: true,
        viewModel: baseVm({
          connection: "loading",
          ladder: [],
          selectedSymbol: null,
          intelSeeds: {},
          tape: [],
          providerNotes: [],
          lastEventAgeMs: null,
        }),
      };

    case "no_match": {
      const ladder = [
        row({
          symbol: "AAAA",
          rank: 1,
          attentionPriority: 80,
          tier: "HIGH",
          momentumState: "ACTIVE",
          momentumIntensity: 50,
          direction: "up",
          reason: "Active participation",
          onWatchlist: false,
        }),
        row({
          symbol: "BBBB",
          rank: 2,
          attentionPriority: 70,
          tier: "MEDIUM",
          momentumState: "BUILDING",
          momentumIntensity: 40,
          direction: "up",
          reason: "Building tape",
          onWatchlist: false,
        }),
      ];
      return {
        scenario,
        skipLoadDelay: true,
        forceFixture: true,
        selectedSymbol: null,
        viewModel: baseVm({
          connection: "live",
          ladder,
          filterPreset: "watchlist",
          selectedSymbol: null,
          providerNotes: [],
        }),
      };
    }

    case "emerging": {
      // Leader stays centre; emerging name must occupy outer ring.
      const ladder = [
        row({
          symbol: "GGGG",
          rank: 1,
          attentionPriority: 55,
          tier: "MEDIUM",
          momentumState: "ACTIVE",
          momentumIntensity: 52,
          direction: "up",
          reason: "Active participation",
        }),
        row({
          symbol: "EEEE",
          rank: 2,
          attentionPriority: 28,
          tier: "LOW",
          momentumState: "EMERGING",
          momentumIntensity: 22,
          direction: "up",
          reason: "Emerging from dormant",
        }),
        row({
          symbol: "LLLL",
          rank: 3,
          attentionPriority: 20,
          tier: "LOW",
          momentumState: "EMERGING",
          momentumIntensity: 16,
          direction: "up",
          reason: "Early emerge",
        }),
      ];
      return {
        scenario,
        skipLoadDelay: true,
        forceFixture: true,
        selectedSymbol: "EEEE",
        viewModel: baseVm({
          connection: "live",
          ladder,
          selectedSymbol: "EEEE",
        }),
      };
    }

    case "catalyst": {
      const ladder = [
        row({
          symbol: "BBBB",
          rank: 1,
          attentionPriority: 82,
          tier: "HIGH",
          momentumState: "BUILDING",
          momentumIntensity: 61,
          direction: "up",
          reason: "Verified catalyst + rising participation",
          hasCatalyst: true,
          catalystVerified: true,
          strategyMatch: true,
        }),
        row({
          symbol: "EEEE",
          rank: 2,
          attentionPriority: 28,
          tier: "LOW",
          momentumState: "EMERGING",
          momentumIntensity: 22,
          direction: "up",
          reason: "Emerging from dormant",
        }),
      ];
      return {
        scenario,
        skipLoadDelay: true,
        forceFixture: true,
        selectedSymbol: "BBBB",
        viewModel: baseVm({
          connection: "live",
          ladder,
          selectedSymbol: "BBBB",
        }),
      };
    }

    case "leader": {
      const ladder = [
        row({
          symbol: "AAAA",
          rank: 1,
          attentionPriority: 92,
          tier: "CRITICAL",
          momentumState: "BREAKING",
          momentumIntensity: 78,
          direction: "up",
          reason: "Leader after hysteresis",
          hasCatalyst: true,
          catalystVerified: true,
          onWatchlist: true,
        }),
        row({
          symbol: "BBBB",
          rank: 2,
          attentionPriority: 70,
          tier: "HIGH",
          momentumState: "BUILDING",
          momentumIntensity: 55,
          direction: "up",
          reason: "Previous leader",
          hasCatalyst: true,
          catalystVerified: true,
        }),
      ];
      const seeds = buildFixtureIntelSeeds("live", FIXED_NOW);
      const aaaa: SelectedTickerSeed = {
        ...seeds.AAAA!,
        timeline: [
          {
            id: "lead-trans",
            atMs: FIXED_NOW - 60_000,
            kind: "momentum_transition",
            summary: "Leader transition: BBBB → AAAA (hysteresis)",
          },
          ...(seeds.AAAA?.timeline ?? []),
        ],
      };
      return {
        scenario,
        skipLoadDelay: true,
        forceFixture: true,
        selectedSymbol: "AAAA",
        previousLeaderSymbol: "BBBB",
        expectSquawkFires: 1,
        viewModel: baseVm({
          connection: "live",
          ladder,
          selectedSymbol: "AAAA",
          intelSeeds: { ...seeds, AAAA: aaaa },
        }),
      };
    }

    case "pinned": {
      const ladder = [
        row({
          symbol: "AAAA",
          rank: 1,
          attentionPriority: 90,
          tier: "CRITICAL",
          momentumState: "BREAKING",
          momentumIntensity: 75,
          direction: "up",
          reason: "Global leader",
          hasCatalyst: true,
          catalystVerified: true,
        }),
        row({
          symbol: "CCCC",
          rank: 2,
          attentionPriority: 66,
          tier: "HIGH",
          momentumState: "ACTIVE",
          momentumIntensity: 58,
          direction: "down",
          reason: "Pinned inspection",
          onWatchlist: true,
        }),
      ];
      return {
        scenario,
        skipLoadDelay: true,
        forceFixture: true,
        pinnedSymbol: "CCCC",
        selectedSymbol: "CCCC",
        autoSelectLeader: false,
        viewModel: baseVm({
          connection: "live",
          ladder,
          selectedSymbol: "CCCC",
        }),
      };
    }

    case "spread": {
      const seeds = buildFixtureIntelSeeds("live", FIXED_NOW);
      const spreadSeed: SelectedTickerSeed = {
        ...seeds.AAAA!,
        tradeability: "Extremely thin — spread deteriorated",
        spreadBps: 180,
        spreadDollars: 0.09,
        dataConfidence: "Reduced — wide spread",
        risks: {
          ...seeds.AAAA!.risks!,
          wide_spread: {
            status: "active",
            detail: "Spread widened vs session median",
          },
        },
      };
      const ladder = [
        row({
          symbol: "AAAA",
          rank: 1,
          attentionPriority: 85,
          tier: "CRITICAL",
          momentumState: "ACTIVE",
          momentumIntensity: 60,
          direction: "up",
          reason: "Spread deteriorated",
          hasCatalyst: true,
          catalystVerified: true,
          dataConfidenceWarning: true,
        }),
      ];
      return {
        scenario,
        skipLoadDelay: true,
        forceFixture: true,
        selectedSymbol: "AAAA",
        viewModel: baseVm({
          connection: "live",
          ladder,
          selectedSymbol: "AAAA",
          intelSeeds: { AAAA: spreadSeed },
        }),
      };
    }

    case "halt": {
      const ladder = [
        row({
          symbol: "FFFF",
          rank: 1,
          attentionPriority: 95,
          tier: "CRITICAL",
          momentumState: "HALTED",
          momentumIntensity: 40,
          direction: "neutral",
          reason: "Trading halt — critical",
          halted: true,
          criticalEvent: true,
          onWatchlist: true,
        }),
      ];
      return {
        scenario,
        skipLoadDelay: true,
        forceFixture: true,
        selectedSymbol: "FFFF",
        viewModel: baseVm({
          connection: "live",
          ladder,
          selectedSymbol: "FFFF",
        }),
      };
    }

    case "outage": {
      const ladder = [
        row({
          symbol: "AAAA",
          rank: 1,
          attentionPriority: 80,
          tier: "HIGH",
          momentumState: "ACTIVE",
          momentumIntensity: 50,
          direction: "up",
          reason: "Stale — not live",
          dataConfidenceWarning: true,
          hasCatalyst: true,
        }),
      ];
      const seeds = buildFixtureIntelSeeds("delayed", FIXED_NOW);
      return {
        scenario,
        skipLoadDelay: true,
        forceFixture: true,
        selectedSymbol: "AAAA",
        viewModel: baseVm({
          connection: "degraded",
          ladder,
          selectedSymbol: "AAAA",
          lastEventAgeMs: 45_000,
          providerNotes: ["Provider outage — values marked stale", "Not live"],
          intelSeeds: {
            ...seeds,
            AAAA: {
              ...seeds.AAAA!,
              dataConfidence: "Low — stale during provider outage",
            },
          },
        }),
      };
    }

    case "partial_outage": {
      const ladder = [
        row({
          symbol: "AAAA",
          rank: 1,
          attentionPriority: 78,
          tier: "HIGH",
          momentumState: "ACTIVE",
          momentumIntensity: 48,
          direction: "up",
          reason: "Catalyst present — quote incomplete",
          hasCatalyst: true,
          catalystVerified: true,
          dataConfidenceWarning: true,
        }),
      ];
      const seeds = buildFixtureIntelSeeds("partial_outage", FIXED_NOW);
      return {
        scenario,
        skipLoadDelay: true,
        forceFixture: true,
        selectedSymbol: "AAAA",
        viewModel: baseVm({
          connection: "partial_outage",
          ladder,
          selectedSymbol: "AAAA",
          lastEventAgeMs: 8_000,
          providerNotes: [
            "News and catalysts degraded",
            "Market quotes partially available",
          ],
          intelSeeds: {
            ...seeds,
            AAAA: {
              ...seeds.AAAA!,
              price: null,
              dataConfidence: "Reduced — quote unavailable",
            },
          },
        }),
      };
    }

    case "disconnected": {
      const ladder = [
        row({
          symbol: "AAAA",
          rank: 1,
          attentionPriority: 80,
          tier: "HIGH",
          momentumState: "ACTIVE",
          momentumIntensity: 50,
          direction: "up",
          reason: "Last known — stream offline",
          dataConfidenceWarning: true,
          hasCatalyst: true,
        }),
      ];
      return {
        scenario,
        skipLoadDelay: true,
        forceFixture: true,
        selectedSymbol: "AAAA",
        viewModel: baseVm({
          connection: "disconnected",
          ladder,
          selectedSymbol: "AAAA",
          lastEventAgeMs: 90_000,
          providerNotes: ["Live stream disconnected — reconnecting"],
        }),
      };
    }

    case "error":
      return {
        scenario,
        skipLoadDelay: true,
        forceFixture: true,
        diagnosticId: "mon_e2e_error_01",
        viewModel: baseVm({
          connection: "error",
          ladder: [],
          selectedSymbol: null,
          intelSeeds: {},
          tape: [],
          providerNotes: [],
          lastEventAgeMs: null,
        }),
      };

    case "recovered": {
      const ladder = [
        row({
          symbol: "AAAA",
          rank: 1,
          attentionPriority: 84,
          tier: "HIGH",
          momentumState: "ACTIVE",
          momentumIntensity: 55,
          direction: "up",
          reason: "Live restored",
          hasCatalyst: true,
          catalystVerified: true,
        }),
      ];
      return {
        scenario,
        skipLoadDelay: true,
        forceFixture: true,
        selectedSymbol: "AAAA",
        viewModel: baseVm({
          connection: "live",
          ladder,
          selectedSymbol: "AAAA",
          lastEventAgeMs: 900,
          providerNotes: ["Recovery complete — live"],
        }),
      };
    }

    default: {
      const _exhaustive: never = scenario;
      return _exhaustive;
    }
  }
}

export function parseMonitorE2eScenario(
  raw: string | null | undefined
): MonitorE2eScenarioId {
  const v = (raw ?? "quiet").trim().toLowerCase();
  if ((MONITOR_E2E_SCENARIOS as readonly string[]).includes(v)) {
    return v as MonitorE2eScenarioId;
  }
  return "quiet";
}
