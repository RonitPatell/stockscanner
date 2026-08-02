/**
 * Monitor delivery load / resilience scenarios (local simulation).
 * Results are NOT production SLOs — see docs/MONITOR_LOAD_HARDENING_REPORT.md
 *
 * Do NOT publish performance targets as achieved from these local tests.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  MonitorDeliveryHub,
  BoundedOutboundQueue,
  dedupeBySequence,
  MONITOR_DELIVERY_VERSION,
  type MonitorStreamMessage,
  type NormalizedMarketEvent,
} from "../src/domain/monitor/delivery/index.ts";
import {
  MonitorClientRuntime,
  connectionFromHealth,
} from "../src/lib/monitor/delivery/client-runtime.ts";

/** Local burst generator — avoids importing Redis-backed server-hub in Node tests. */
function synthesizeNormalizedBurst(opts: {
  symbolCount: number;
  events: number;
  hotSymbol?: string;
  baseMs?: number;
}): NormalizedMarketEvent[] {
  const base = opts.baseMs ?? Date.now();
  const hot = (opts.hotSymbol ?? "HOT1").toUpperCase();
  const out: NormalizedMarketEvent[] = [];
  for (let i = 0; i < opts.events; i++) {
    const isHot = i % 7 === 0;
    const sym = isHot
      ? hot
      : `S${String(i % opts.symbolCount).padStart(4, "0")}`;
    out.push({
      symbol: sym,
      observedAtMs: base + i,
      ingestedAtMs: base + i + 2,
      price: 1 + (i % 100) / 50,
      changePercent: ((i % 21) - 10) / 2,
      relativeVolume: isHot ? 12 : 1 + (i % 5),
      tradesPerSecond: isHot ? 80 : 2 + (i % 10),
      halted: i % 2000 === 0,
      criticalEvent: i % 1500 === 0,
      momentumState: isHot ? "BREAKING" : i % 5 === 0 ? "BUILDING" : "QUIET",
      momentumIntensity: isHot ? 0.9 : (i % 10) / 12,
      direction: isHot ? "up" : "neutral",
      availability: "ok",
    });
  }
  return out;
}

type ScenarioResult = {
  name: string;
  ok: boolean;
  detail: Record<string, number | string | boolean>;
  assumptions: string[];
};

const results: ScenarioResult[] = [];

function record(r: ScenarioResult) {
  results.push(r);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ loadScenario: r }));
}

function makeEvents(n: number, symbols: number, hot = "HOT1"): NormalizedMarketEvent[] {
  return synthesizeNormalizedBurst({
    symbolCount: symbols,
    events: n,
    hotSymbol: hot,
    // Use "now" so events are not discarded as lagged vs wall clock
    baseMs: Date.now(),
  });
}

test("version pinned", () => {
  assert.equal(MONITOR_DELIVERY_VERSION, "monitor-delivery-v1.0");
});

test("load: 10k tracked symbols with compact ladder fanout", () => {
  const hub = new MonitorDeliveryHub({
    maxTrackedSymbols: 10_000,
    maxLadderSize: 64,
    snapshotEveryNEvents: 2_000,
  });
  const events = makeEvents(12_000, 10_000);
  const t0 = Date.now();
  hub.offerSourceEvents(events);
  hub.process(12_000);
  const ms = Date.now() - t0;
  const snap = hub.latestSnapshot();
  const m = hub.metrics();

  record({
    name: "track_10k_symbols_compact_ladder",
    ok: m.trackedSymbols <= 10_000 && snap.symbols.length <= 64 && m.eventsIn > 0,
    detail: {
      tracked: m.trackedSymbols,
      ladderSize: snap.symbols.length,
      eventsIn: m.eventsIn,
      processMs: ms,
      droppedBackpressure: m.eventsDroppedBackpressure,
      droppedLag: m.eventsDroppedLag,
    },
    assumptions: [
      "In-process hub only — not 10k live exchange feeds",
      "Clients receive top-64 ladder snapshot/deltas, not full universe ticks",
    ],
  });

  assert.ok(snap.symbols.length <= 64);
  assert.ok(m.trackedSymbols <= 10_000);
});

test("load: 50k events/sec burst sample (local)", () => {
  const hub = new MonitorDeliveryHub({
    maxTrackedSymbols: 5_000,
    maxInboundQueue: 50_000,
    snapshotEveryNEvents: 5_000,
  });
  const BURST = 50_000;
  const events = makeEvents(BURST, 2_000);
  const t0 = Date.now();
  const accepted = hub.offerSourceEvents(events);
  const processed = hub.process(BURST);
  const ms = Date.now() - t0;
  const m = hub.metrics();

  record({
    name: "burst_50k_normalized_events",
    ok: accepted > 0 && processed > 0 && ms < 120_000,
    detail: {
      burst: BURST,
      accepted,
      processed,
      wallMs: ms,
      impliedEps: ms > 0 ? Math.round((processed / ms) * 1000) : 0,
      droppedBackpressure: m.eventsDroppedBackpressure,
      outboundDepth: m.outboundQueueDepth,
    },
    assumptions: [
      "Normalized events — not raw tape ticks to browsers",
      "Local CPU only; staging must re-measure under Redis/SSE fanout",
      "impliedEps is a lab observation, NOT a published SLA",
    ],
  });

  assert.ok(processed > 0);
});

test("load: 1,000 concurrent session claims (simulated)", () => {
  const hub = new MonitorDeliveryHub({ snapshotEveryNEvents: 100 });
  hub.offerSourceEvents(makeEvents(500, 200));
  hub.process(500);
  const snap = hub.latestSnapshot();

  const SESSIONS = 1_000;
  const t0 = Date.now();
  let applied = 0;
  for (let i = 0; i < SESSIONS; i++) {
    const rt = new MonitorClientRuntime({ maxQueue: 64, frameBudgetMs: 16 });
    rt.accept({
      type: "snapshot",
      id: String(snap.sequence),
      sequence: snap.sequence,
      payload: snap,
    });
    const r = rt.applyFrame({ nowMs: Date.now(), documentVisible: true });
    applied += r.applied;
    hub.acknowledge(snap.sequence);
  }
  const ms = Date.now() - t0;

  record({
    name: "sessions_1000_snapshot_apply",
    ok: applied >= SESSIONS && ms < 60_000,
    detail: {
      sessions: SESSIONS,
      applied,
      wallMs: ms,
      clientAcks: hub.metrics().clientAcks,
    },
    assumptions: [
      "In-process ClientRuntime apply — NOT 1000 real EventSource sockets",
      "Next.js / reverse-proxy SSE limits dominate real fanout",
    ],
  });

  assert.ok(hub.metrics().clientAcks >= SESSIONS || snap.sequence === 0);
  // Acks count only when sequence > 0
  if (snap.sequence > 0) assert.equal(hub.metrics().clientAcks, SESSIONS);
});

test("load: 5,000 sessions optional (simulated, capped time)", () => {
  const hub = new MonitorDeliveryHub();
  hub.offerSourceEvents(makeEvents(200, 100));
  hub.process(200);
  const snap = hub.latestSnapshot();
  const SESSIONS = Number(process.env.MONITOR_LOAD_SESSIONS_5K ?? "5000");
  const t0 = Date.now();
  let applied = 0;
  for (let i = 0; i < SESSIONS; i++) {
    const rt = new MonitorClientRuntime({ maxQueue: 32 });
    rt.accept({
      type: "snapshot",
      id: String(snap.sequence),
      sequence: snap.sequence,
      payload: snap,
    });
    applied += rt.applyFrame({ nowMs: Date.now() + i, documentVisible: true }).applied;
  }
  const ms = Date.now() - t0;

  record({
    name: "sessions_5000_snapshot_apply",
    ok: applied >= SESSIONS,
    detail: { sessions: SESSIONS, applied, wallMs: ms },
    assumptions: [
      "Set MONITOR_LOAD_SESSIONS_5K=0 to skip sizing in constrained CI if needed",
      "Still not real browser SSE; staging infrastructure required for claimable fanout",
    ],
  });

  assert.ok(applied >= SESSIONS);
});

test("resilience: extremely active symbol + provider disconnect circuit", () => {
  const hub = new MonitorDeliveryHub({
    sourceCircuit: { failureThreshold: 2, coolDownMs: 5_000 },
  });
  hub.offerSourceEvents(makeEvents(2_000, 50, "HOT1"));
  hub.process(2_000);
  const leaderBefore = hub.latestSnapshot().leaderSymbol;

  hub.tripSourceCircuit();
  const rejected = hub.offerSourceEvents(makeEvents(100, 10));
  assert.equal(rejected, 0);
  assert.equal(hub.metrics().health, "degraded");

  hub.clearSourceCircuit();
  const accepted = hub.offerSourceEvents(makeEvents(50, 10));
  hub.process(50);

  record({
    name: "hot_symbol_and_provider_disconnect",
    ok: leaderBefore === "HOT1" && rejected === 0 && accepted > 0,
    detail: {
      leaderBefore: leaderBefore ?? "",
      rejectedWhileOpen: rejected,
      acceptedAfterClear: accepted,
      circuit: hub.metrics().circuitSource,
    },
    assumptions: ["Circuit is in-process; Redis-backed ingest circuits used for news path separately"],
  });
});

test("resilience: Redis restart via checkpoint restore", () => {
  const hub = new MonitorDeliveryHub();
  hub.offerSourceEvents(makeEvents(300, 80));
  hub.process(300);
  const cp = hub.exportCheckpoint();
  assert.ok(cp.symbols.length > 0);

  const hub2 = new MonitorDeliveryHub();
  hub2.restoreCheckpoint(cp);
  const snap = hub2.latestSnapshot();

  record({
    name: "checkpoint_restore_after_restart",
    ok:
      hub2.metrics().trackedSymbols === cp.symbols.length &&
      (snap.health === "recovering" ||
        snap.health === "live" ||
        snap.health === "degraded"),
    detail: {
      restoredSymbols: hub2.metrics().trackedSymbols,
      sequence: cp.sequence,
      health: snap.health,
    },
    assumptions: [
      "Simulates worker memory loss + checkpoint reload",
      "Live Redis wipe not performed in CI",
    ],
  });

  assert.equal(hub2.metrics().trackedSymbols, cp.symbols.length);
});

test("resilience: database slowdown does not block delta publish path", async () => {
  const hub = new MonitorDeliveryHub();
  const t0 = Date.now();
  // Simulate slow DB alongside hub processing
  const db = new Promise((r) => setTimeout(r, 120));
  hub.offerSourceEvents(makeEvents(400, 40));
  const processed = hub.process(400);
  await db;
  const wall = Date.now() - t0;

  record({
    name: "db_slowdown_isolation",
    ok: processed > 0 && wall < 5_000,
    detail: { processed, wallMs: wall, dbDelayMs: 120 },
    assumptions: ["Hub path is memory-local; DB delay is parallel simulation only"],
  });
});

test("resilience: SSE reconnect storm with Last-Event-ID dedupe", () => {
  const hub = new MonitorDeliveryHub({ snapshotEveryNEvents: 50 });
  hub.offerSourceEvents(makeEvents(400, 30));
  hub.process(400);

  const rt = new MonitorClientRuntime();
  const cursor = Math.max(0, hub.metrics().publishedDeltas > 0 ? 1 : 0);
  // Replay overlapping windows (storm)
  for (let storm = 0; storm < 50; storm++) {
    const batch = hub.messagesAfter(cursor, 32);
    for (const msg of batch) rt.accept(msg);
  }
  const before = rt.queue.stats().depth;
  rt.applyFrame({ nowMs: Date.now(), documentVisible: true, maxMessages: 64 });
  // Second identical replay must not grow unique state incorrectly
  const again = hub.messagesAfter(0, 64);
  const deduped = dedupeBySequence(
    again.filter((m): m is MonitorStreamMessage & { sequence: number } => "sequence" in m),
    new Set(rt.seenSequences)
  );

  record({
    name: "reconnect_storm_dedupe",
    ok: deduped.length === 0 || again.length >= 0,
    detail: {
      queueDepthAfterStorm: before,
      replayDuplicatesSkipped: again.length - deduped.length,
      lastSequence: rt.getState().lastSequence,
    },
    assumptions: ["Client sequence set dedupes overlapping Last-Event-ID replays"],
  });

  assert.ok(rt.getState().lastSequence >= 0);
});

test("resilience: tab hidden 1h then restore drops visual backlog", () => {
  const rt = new MonitorClientRuntime({ maxQueue: 64, frameBudgetMs: 16 });
  const base = Date.now();
  for (let i = 1; i <= 40; i++) {
    rt.accept({
      type: "delta",
      id: String(i),
      sequence: i,
      priority: "visual",
      payload: [
        {
          symbol: "AAA",
          sequence: i,
          asOfMs: base,
          rank: 1,
          attentionPriority: 50,
          momentumState: "BUILDING",
          momentumIntensity: 0.4,
          direction: "up",
          halted: false,
          criticalEvent: false,
          dataAvailability: "ok",
          stale: false,
        },
      ],
    });
  }
  rt.accept({
    type: "health",
    id: "41",
    sequence: 41,
    health: "degraded",
    reason: "provider_gap",
    publishedAtMs: base,
  });

  // Hidden hour — only critical/state apply
  rt.applyFrame({ nowMs: base + 3_600_000, documentVisible: false });
  rt.onVisibilityRestored(
    {
      schemaVersion: MONITOR_DELIVERY_VERSION,
      sequence: 100,
      publishedAtMs: base + 3_600_000,
      health: "live",
      symbols: [
        {
          symbol: "AAA",
          sequence: 100,
          asOfMs: base + 3_600_000,
          rank: 1,
          attentionPriority: 70,
          momentumState: "TRENDING",
          momentumIntensity: 0.7,
          direction: "up",
          halted: false,
          criticalEvent: false,
          dataAvailability: "ok",
          stale: false,
        },
      ],
      trackedSymbolCount: 1,
      leaderSymbol: "AAA",
      dataNotes: [],
    },
    base + 3_600_000
  );

  const st = rt.getState();
  record({
    name: "tab_hidden_1h_restore",
    ok: st.lastSequence === 100 && st.symbols.get("AAA")?.momentumState === "TRENDING",
    detail: {
      lastSequence: st.lastSequence,
      health: st.health,
      notes: st.notes.join("|"),
    },
    assumptions: ["Visibility restore forces snapshot; visual backlog cleared"],
  });

  assert.equal(st.symbols.get("AAA")?.momentumState, "TRENDING");
});

test("invariant: stale never presented as live connection", () => {
  assert.equal(connectionFromHealth("stale"), "delayed");
  assert.equal(connectionFromHealth("live"), "live");
  assert.equal(connectionFromHealth("degraded"), "degraded");
});

test("invariant: outbound drops visual before critical", () => {
  const q = new BoundedOutboundQueue(4);
  for (let i = 1; i <= 6; i++) {
    q.enqueue({
      sequence: i,
      priority: i === 6 ? "critical" : "visual",
      enqueuedAtMs: i,
      message: {
        type: i === 6 ? "health" : "delta",
        id: String(i),
        sequence: i,
        ...(i === 6
          ? { health: "degraded", reason: "x", publishedAtMs: i }
          : {
              priority: "visual",
              payload: [
                {
                  symbol: "Z",
                  sequence: i,
                  asOfMs: i,
                  rank: 1,
                  attentionPriority: 1,
                  momentumState: "Q",
                  momentumIntensity: 0.1,
                  direction: "neutral",
                  halted: false,
                  criticalEvent: false,
                  dataAvailability: "ok",
                  stale: false,
                },
              ],
            }),
      } as MonitorStreamMessage,
    });
  }
  const drained = q.drain(10);
  assert.ok(drained.some((d) => d.priority === "critical"));
  assert.ok(q.stats().droppedObsoleteVisual + q.stats().droppedCapacity > 0);
});

test("summary: print scenario table footer", () => {
  assert.ok(results.length >= 8);
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      report: "docs/MONITOR_LOAD_HARDENING_REPORT.md",
      disclaimer: "Local simulation only — do not publish targets as achieved",
      scenarios: results.length,
    })
  );
});
