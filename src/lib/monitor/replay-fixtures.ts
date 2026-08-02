/**
 * Synthetic Monitor Replay sessions for admin calibration / local demos.
 * Compact frames only — not a tick archive.
 */

import {
  MONITOR_ATTENTION_VERSION,
} from "@/domain/monitor/attention/version";
import {
  MONITOR_MARKET_STATE_VERSION,
} from "@/domain/monitor/market-state/version";
import {
  MONITOR_MOMENTUM_VERSION,
} from "@/domain/monitor/momentum/version";
import {
  MONITOR_MOMENTUM_STATE_VERSION,
} from "@/domain/monitor/momentum-state/version";
import {
  appendCompactFrames,
  buildReplayFrame,
  createReplaySession,
  type MonitorReplaySession,
  type ReplayEngineVersions,
} from "@/domain/monitor/replay";

const VERSIONS: ReplayEngineVersions = {
  marketState: MONITOR_MARKET_STATE_VERSION,
  momentum: MONITOR_MOMENTUM_VERSION,
  momentumState: MONITOR_MOMENTUM_STATE_VERSION,
  attention: MONITOR_ATTENTION_VERSION,
  configHash: "fixture-config-v1",
};

const T0 = Date.parse("2026-07-27T14:30:00.000Z");

export function buildFixtureReplaySession(
  id = "fixture-monitor-replay-v1"
): MonitorReplaySession {
  let session = createReplaySession({
    id,
    createdAtMs: T0,
    fromMs: T0,
    toMs: T0 + 30 * 60_000,
    symbolScope: ["ABC", "XYZ"],
    minIntervalMs: 1_000,
    maxFrames: 5_000,
  });

  const frames = [];
  const states = ["QUIET", "BUILDING", "BREAKING", "TRENDING", "FADING", "QUIET"] as const;
  for (let i = 0; i < 60; i++) {
    const asOfMs = T0 + i * 30_000;
    const stateIdx = Math.min(states.length - 1, Math.floor(i / 10));
    const state = states[stateIdx]!;
    const intensity = Math.min(1, 0.1 + stateIdx * 0.18 + (i % 3) * 0.02);
    const isLeader = i % 12 === 0;
    frames.push(
      buildReplayFrame({
        asOfMs,
        symbol: "ABC",
        versions: VERSIONS,
        market: {
          lastPrice: 2.5 + intensity * 0.4,
          freshnessMs: i % 17 === 0 ? 8_000 : 200,
          tradesPerSecond: 5 + intensity * 40,
          dollarVolumeVelocity: 50_000 * intensity,
          relativeVolume: 1 + intensity * 3,
          spreadBps: 40 - intensity * 10,
          sessionSegment: "regular",
        },
        momentum: {
          intensity,
          state,
          direction: intensity > 0.3 ? "up" : "flat",
        },
        attention: {
          priority: intensity * 100,
          rank: isLeader ? 1 : 2 + (i % 5),
          isLeader,
          previousRank: isLeader ? 3 : 1,
        },
        events:
          i === 20
            ? [
                {
                  kind: "catalyst",
                  refId: "cat-fixture-1",
                  summary: "PR filed",
                  atMs: asOfMs,
                },
              ]
            : i === 35
              ? [
                  {
                    kind: "halt",
                    refId: "halt-fixture-1",
                    summary: "LULD pause",
                    atMs: asOfMs,
                  },
                ]
              : isLeader
                ? [
                    {
                      kind: "leader_change",
                      refId: `lead-${i}`,
                      summary: "ABC took leader",
                      atMs: asOfMs,
                    },
                  ]
                : [],
        dataQuality: i % 17 === 0 ? "stale" : i === 40 ? "unavailable" : "ok",
        corporateActionAdjusted: false,
        rawRefs: [
          {
            source: "fixture",
            eventId: `tick-ref-${i}`,
            observedAtMs: asOfMs,
          },
        ],
      })
    );

    // One-print breakout pattern around i=25
    if (i === 25) {
      frames.push(
        buildReplayFrame({
          asOfMs: asOfMs + 1_000,
          symbol: "ABC",
          versions: VERSIONS,
          market: {
            lastPrice: 3.2,
            freshnessMs: 100,
            tradesPerSecond: 80,
            dollarVolumeVelocity: 200_000,
            relativeVolume: 8,
            spreadBps: 20,
            sessionSegment: "regular",
          },
          momentum: {
            intensity: 0.95,
            state: "BREAKING",
            direction: "up",
          },
          attention: {
            priority: 95,
            rank: 1,
            isLeader: true,
            previousRank: 2,
          },
          events: [
            {
              kind: "state_transition",
              refId: "st-false-break",
              summary: "QUIET→BREAKING spike",
              atMs: asOfMs + 1_000,
            },
          ],
          dataQuality: "ok",
          rawRefs: [
            {
              source: "fixture",
              eventId: "one-print",
              observedAtMs: asOfMs + 1_000,
            },
          ],
        })
      );
      frames.push(
        buildReplayFrame({
          asOfMs: asOfMs + 3_000,
          symbol: "ABC",
          versions: VERSIONS,
          market: {
            lastPrice: 2.55,
            freshnessMs: 120,
            tradesPerSecond: 8,
            dollarVolumeVelocity: 40_000,
            relativeVolume: 1.2,
            spreadBps: 45,
            sessionSegment: "regular",
          },
          momentum: {
            intensity: 0.25,
            state: "QUIET",
            direction: "flat",
          },
          attention: {
            priority: 20,
            rank: 4,
            isLeader: false,
            previousRank: 1,
          },
          dataQuality: "ok",
          rawRefs: [
            {
              source: "fixture",
              eventId: "revert",
              observedAtMs: asOfMs + 3_000,
            },
          ],
        })
      );
    }

    frames.push(
      buildReplayFrame({
        asOfMs,
        symbol: "XYZ",
        versions: VERSIONS,
        market: {
          lastPrice: 1.1,
          freshnessMs: 300,
          tradesPerSecond: 2,
          dollarVolumeVelocity: 10_000,
          relativeVolume: 0.8,
          spreadBps: 80,
          sessionSegment: "regular",
        },
        momentum: {
          intensity: 0.15,
          state: "QUIET",
          direction: "flat",
        },
        attention: {
          priority: 10,
          rank: 8,
          isLeader: false,
          previousRank: 8,
        },
        dataQuality: "ok",
        rawRefs: [
          {
            source: "fixture",
            eventId: `xyz-${i}`,
            observedAtMs: asOfMs,
          },
        ],
      })
    );
  }

  session = appendCompactFrames(session, frames);
  return session;
}

/** Candidate frames with altered intensity/state for shadow compare demos. */
export function buildCandidateShadowSession(
  production: MonitorReplaySession,
  candidateEngine = "monitor-momentum-candidate-v0.9"
): MonitorReplaySession {
  const frames = production.frames.map((f) => ({
    ...f,
    versions: {
      ...f.versions,
      momentum: candidateEngine,
      configHash: "candidate-config-v0.9",
    },
    momentum: {
      ...f.momentum,
      intensity:
        f.momentum.intensity == null
          ? null
          : Math.min(1, f.momentum.intensity * 1.1),
      state:
        f.momentum.state === "BREAKING" ? "TRENDING" : f.momentum.state,
    },
    attention: {
      ...f.attention,
      rank:
        f.attention.rank == null
          ? null
          : f.symbol === "ABC" && f.attention.rank === 1
            ? 2
            : f.attention.rank,
    },
  }));
  return {
    ...production,
    id: `${production.id}-candidate`,
    frames,
  };
}
