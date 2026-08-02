import type {
  MonitorConnectionState,
  MonitorFilterPreset,
  MonitorViewModel,
} from "./monitor-types.ts";
import { buildFixtureIntelSeeds } from "./selected-ticker/selected-ticker-seeds.ts";
import { buildFixtureTapeSync } from "./event-tape/tape-fixtures.ts";

/** Deterministic demo fixtures for UI states (not live market data). */
export function buildMonitorFixture(
  connection: MonitorConnectionState,
  filter: MonitorFilterPreset = "all"
): MonitorViewModel {
  if (connection === "loading") {
    return {
      connection,
      lastEventAgeMs: null,
      sessionLabel: "Regular",
      filterPreset: filter,
      ladder: [],
      selectedSymbol: null,
      intelSeeds: {},
      tape: [],
      providerNotes: [],
    };
  }

  if (connection === "empty") {
    return {
      connection,
      lastEventAgeMs: null,
      sessionLabel: "Regular",
      filterPreset: filter,
      ladder: [],
      selectedSymbol: null,
      intelSeeds: {},
      tape: [],
      providerNotes: ["No symbols match the current filter preset."],
    };
  }

  if (connection === "disconnected") {
    return {
      connection,
      lastEventAgeMs: null,
      sessionLabel: "Regular",
      filterPreset: filter,
      ladder: [],
      selectedSymbol: null,
      intelSeeds: {},
      tape: [],
      providerNotes: ["Market stream disconnected — reconnecting is automatic."],
    };
  }

  const ladder = [
    {
      symbol: "AAAA",
      rank: 1,
      attentionPriority: 88,
      tier: "CRITICAL" as const,
      momentumState: "BREAKING",
      momentumIntensity: 72,
      direction: "up" as const,
      reason: "Trade-rate burst after news",
      onWatchlist: true,
      hasCatalyst: true,
      catalystVerified: true,
    },
    {
      symbol: "BBBB",
      rank: 2,
      attentionPriority: 74,
      tier: "HIGH" as const,
      momentumState: "BUILDING",
      momentumIntensity: 61,
      direction: "up" as const,
      reason: "Verified catalyst + rising participation",
      onWatchlist: false,
      strategyMatch: true,
      hasCatalyst: true,
      catalystVerified: true,
    },
    {
      symbol: "CCCC",
      rank: 3,
      attentionPriority: 66,
      tier: "HIGH" as const,
      momentumState: "ACTIVE",
      momentumIntensity: 58,
      direction: "down" as const,
      reason: "Downward momentum near LOD",
      onWatchlist: true,
      strategyMatch: true,
    },
    {
      symbol: "FFFF",
      rank: 4,
      attentionPriority: 70,
      tier: "CRITICAL" as const,
      momentumState: "HALTED",
      momentumIntensity: 40,
      direction: "neutral" as const,
      reason: "Trading halt — critical",
      onWatchlist: true,
      halted: true,
      criticalEvent: true,
    },
    {
      symbol: "DDDD",
      rank: 5,
      attentionPriority: 48,
      tier: "MEDIUM" as const,
      momentumState: "COOLING",
      momentumIntensity: 34,
      direction: "neutral" as const,
      reason: "Cooling after active phase",
      onWatchlist: false,
    },
    {
      symbol: "EEEE",
      rank: 6,
      attentionPriority: 28,
      tier: "LOW" as const,
      momentumState: "EMERGING",
      momentumIntensity: 22,
      direction: "up" as const,
      reason: "Emerging from dormant",
      onWatchlist: false,
    },
    {
      symbol: "GGGG",
      rank: 7,
      attentionPriority: 55,
      tier: "MEDIUM" as const,
      momentumState: "ACTIVE",
      momentumIntensity: 52,
      direction: "up" as const,
      reason: "Active participation",
      onWatchlist: false,
    },
    {
      symbol: "HHHH",
      rank: 8,
      attentionPriority: 42,
      tier: "MEDIUM" as const,
      momentumState: "RECLAIMING",
      momentumIntensity: 38,
      direction: "up" as const,
      reason: "Reclaiming after cool",
      onWatchlist: false,
    },
    {
      symbol: "IIII",
      rank: 9,
      attentionPriority: 24,
      tier: "LOW" as const,
      momentumState: "FADING",
      momentumIntensity: 18,
      direction: "down" as const,
      reason: "Fading participation",
      onWatchlist: false,
    },
    {
      symbol: "JJJJ",
      rank: 10,
      attentionPriority: 63,
      tier: "HIGH" as const,
      momentumState: "BREAKING",
      momentumIntensity: 64,
      direction: "up" as const,
      reason: "Secondary break",
      onWatchlist: false,
    },
    {
      symbol: "KKKK",
      rank: 11,
      attentionPriority: 36,
      tier: "MEDIUM" as const,
      momentumState: "BUILDING",
      momentumIntensity: 33,
      direction: "up" as const,
      reason: "Building slowly",
      onWatchlist: true,
    },
    {
      symbol: "LLLL",
      rank: 12,
      attentionPriority: 20,
      tier: "LOW" as const,
      momentumState: "EMERGING",
      momentumIntensity: 16,
      direction: "neutral" as const,
      reason: "Early emerge",
      onWatchlist: false,
    },
    {
      symbol: "MMMM",
      rank: 13,
      attentionPriority: 15,
      tier: "LOW" as const,
      momentumState: "DORMANT",
      momentumIntensity: 8,
      direction: "neutral" as const,
      reason: "Should be capped out of field (13th)",
      onWatchlist: false,
    },
  ];

  // Ladder component owns filtering; fixtures return the full set.
  const filtered = ladder;

  const selected = filtered[0]?.symbol ?? null;
  const row = filtered[0];

  const age =
    connection === "delayed"
      ? 45_000
      : connection === "degraded"
        ? 8_000
        : connection === "partial_outage"
          ? 12_000
          : 1_200;

  return {
    connection,
    lastEventAgeMs: age,
    sessionLabel: "Regular",
    filterPreset: filter,
    ladder: filtered,
    selectedSymbol: selected,
    intelSeeds: buildFixtureIntelSeeds(connection),
    tape: buildFixtureTapeSync(Date.now() - Math.min(age, 5_000)),
    providerNotes:
      connection === "partial_outage"
        ? ["NBBO quotes degraded", "Trades + aggregates available"]
        : connection === "delayed"
          ? ["Entitlement shows delayed prints"]
          : connection === "degraded"
            ? ["Elevated event lag"]
            : [],
  };
}
