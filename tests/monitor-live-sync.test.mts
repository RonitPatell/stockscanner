import assert from "node:assert/strict";
import test from "node:test";
import {
  planSyncResume,
  detectLiveGap,
  shouldApplyEntityVersion,
  orderDedupeAndFilterStaleEntities,
  nextReconnectDelayMs,
  reconnectDelayForVisibility,
  transitionSyncState,
  syncKeepsSnapshotVisible,
  syncStatusLabel,
  syncShouldFreezeMotion,
  buildMonitorSyncAck,
  assertAckHasNoPrivateFields,
  effectiveLiveLabel,
  HIDDEN_RECONNECT_MIN_MS,
} from "../src/domain/monitor/sync/index.ts";
import { MonitorDeliveryHub } from "../src/domain/monitor/delivery/hub.ts";
import { MonitorLiveSyncController } from "../src/lib/monitor/delivery/live-sync.ts";
import type { MonitorLadderSnapshot } from "../src/domain/monitor/delivery/types.ts";

function snap(sequence: number): MonitorLadderSnapshot {
  return {
    schemaVersion: "v",
    sequence,
    publishedAtMs: 1_000,
    health: "live",
    symbols: [
      {
        symbol: "AAAA",
        sequence: 1,
        asOfMs: 1_000,
        rank: 1,
        attentionPriority: 80,
        momentumState: "BUILDING",
        momentumIntensity: 0.7,
        direction: "up",
        halted: false,
        criticalEvent: false,
        dataAvailability: "ok",
        stale: false,
      },
    ],
    trackedSymbolCount: 1,
    leaderSymbol: "AAAA",
    dataNotes: [],
  };
}

test("planSyncResume: event during server rendering covered by replay", () => {
  // SSR lastEventId=10; events 11–12 arrived before client connect.
  const plan = planSyncResume({
    afterEventId: 10,
    hubSequence: 12,
    ringSequences: [9, 10, 11, 12],
  });
  assert.equal(plan.mode, "replay");
  assert.deepEqual(
    plan.messages.map((m) => m.sequence),
    [11, 12]
  );
});

test("planSyncResume: ring truncation forces full snapshot", () => {
  const plan = planSyncResume({
    afterEventId: 5,
    hubSequence: 100,
    ringSequences: [90, 91, 92],
  });
  assert.equal(plan.mode, "full_snapshot");
  assert.equal(plan.reason, "ring_truncated");
});

test("planSyncResume: worker restart empty ring", () => {
  const plan = planSyncResume({
    afterEventId: 40,
    hubSequence: 45,
    ringSequences: [],
  });
  assert.equal(plan.mode, "full_snapshot");
  assert.equal(plan.reason, "worker_restart");
});

test("detectLiveGap: missed event", () => {
  assert.equal(detectLiveGap(10, 11).gap, false);
  assert.equal(detectLiveGap(10, 13).gap, true);
  assert.equal(detectLiveGap(10, 13).reason, "sequence_hole");
});

test("duplicate and out-of-order entity versions ignored", () => {
  assert.equal(shouldApplyEntityVersion(null, 5), true);
  assert.equal(shouldApplyEntityVersion(5, 5), false);
  assert.equal(shouldApplyEntityVersion(5, 4), false);
  assert.equal(shouldApplyEntityVersion(5, 6), true);
  const ordered = orderDedupeAndFilterStaleEntities([
    { eventId: 3, symbol: "AAAA", entityVersion: 2 },
    { eventId: 1, symbol: "AAAA", entityVersion: 1 },
    { eventId: 2, symbol: "AAAA", entityVersion: 1 }, // stale / same entity
    { eventId: 1, symbol: "AAAA", entityVersion: 1 }, // dup event
    { eventId: 4, symbol: "BBBB", entityVersion: 1 },
  ]);
  assert.deepEqual(
    ordered.map((e) => e.eventId),
    [1, 3, 4]
  );
});

test("hub.planResume matches gap planner for hydration race", () => {
  const now = Date.now();
  const hub = new MonitorDeliveryHub({}, { maxRing: 64, nowFn: () => now });
  hub.offerSourceEvents([
    {
      symbol: "AAAA",
      observedAtMs: now,
      ingestedAtMs: now,
      price: 1,
      changePercent: 1,
      relativeVolume: 2,
      tradesPerSecond: 3,
      momentumIntensity: 0.5,
    },
  ]);
  hub.process(10);
  const after = hub.currentSequence();
  assert.ok(after > 0, "first process must publish");
  hub.offerSourceEvents([
    {
      symbol: "AAAA",
      observedAtMs: now + 1,
      ingestedAtMs: now + 1,
      price: 1.1,
      changePercent: 2,
      relativeVolume: 3,
      tradesPerSecond: 4,
      momentumIntensity: 0.6,
    },
  ]);
  hub.process(10);
  const plan = hub.planResume(after, 64);
  assert.equal(plan.mode, "replay");
  assert.ok(plan.messages.length >= 1);
});

test("sync machine: snapshot → connecting → catching up → live", () => {
  let s = transitionSyncState("DISCONNECTED", { type: "SNAPSHOT_LOADED" });
  assert.equal(s, "SNAPSHOT_READY");
  s = transitionSyncState(s, { type: "CONNECT" });
  assert.equal(s, "CONNECTING");
  s = transitionSyncState(s, { type: "CATCHUP_START" });
  assert.equal(s, "CATCHING_UP");
  s = transitionSyncState(s, { type: "CATCHUP_APPLIED" });
  assert.equal(s, "LIVE");
  assert.equal(syncKeepsSnapshotVisible("CONNECTING"), true);
  assert.equal(syncKeepsSnapshotVisible("CATCHING_UP"), true);
  assert.equal(syncStatusLabel("CATCHING_UP"), "Syncing live…");
  assert.equal(syncShouldFreezeMotion("CATCHING_UP"), true);
  assert.equal(syncShouldFreezeMotion("LIVE"), false);
});

test("backoff with jitter; hidden tab slows reconnects", () => {
  const d0 = nextReconnectDelayMs(0, undefined, () => 0.5);
  const d3 = nextReconnectDelayMs(3, undefined, () => 0.5);
  assert.ok(d3 >= d0);
  const hidden = reconnectDelayForVisibility(0, true, undefined, () => 0.5);
  assert.ok(hidden >= HIDDEN_RECONNECT_MIN_MS);
});

test("ack has no private fields", () => {
  const ack = buildMonitorSyncAck({
    streamConnected: true,
    snapshotId: "snap_1",
    lastEventReceived: "12",
    lastEventApplied: "12",
    liveSyncCompleted: true,
    sequence: 12,
  });
  assert.equal(assertAckHasNoPrivateFields(ack as unknown as Record<string, unknown>).length, 0);
  assert.ok(
    assertAckHasNoPrivateFields({ watchlist: ["AAAA"], sequence: 1 }).includes(
      "watchlist"
    )
  );
});

test("effectiveLiveLabel never calls disconnected data live", () => {
  assert.equal(
    effectiveLiveLabel("DISCONNECTED", Date.now() - 100, Date.now()),
    "disconnected"
  );
  assert.equal(
    effectiveLiveLabel("CATCHING_UP", Date.now() - 100, Date.now()),
    "syncing"
  );
  assert.equal(
    effectiveLiveLabel("LIVE", Date.now() - 100, Date.now()),
    "live"
  );
  assert.equal(
    effectiveLiveLabel("LIVE", Date.now() - 60_000, Date.now()),
    "stale"
  );
});

test("LiveSyncController: event during hydration then LIVE", () => {
  const messages: string[] = [];
  type Es = {
    onmessage: ((ev: MessageEvent) => void) | null;
    onerror: ((ev: Event) => void) | null;
    close: () => void;
  };
  let esRef: Es | null = null;
  const ctrl = new MonitorLiveSyncController({
    initialSnapshot: snap(10),
    initialLastEventId: "10",
    eventSourceFactory: () => {
      esRef = {
        onmessage: null,
        onerror: null,
        close: () => {},
      };
      return esRef;
    },
    nowMs: () => 5_000,
  });

  assert.equal(ctrl.getSyncState(), "SNAPSHOT_READY");
  ctrl.start();
  assert.equal(ctrl.getSyncState(), "CONNECTING");

  const fire = (data: unknown) => {
    esRef?.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  };

  fire({
    type: "catchup_start",
    id: "1",
    fromEventId: "10",
    mode: "replay",
    reason: "none",
  });
  assert.equal(ctrl.getSyncState(), "CATCHING_UP");

  fire({
    type: "delta",
    id: "11",
    sequence: 11,
    priority: "state",
    payload: [
      {
        symbol: "AAAA",
        sequence: 2,
        asOfMs: 5_000,
        rank: 1,
        attentionPriority: 85,
        momentumState: "BREAKING",
        momentumIntensity: 0.9,
        direction: "up",
        halted: false,
        criticalEvent: false,
        dataAvailability: "ok",
        stale: false,
      },
    ],
  });

  fire({
    type: "catchup_complete",
    id: "2",
    lastEventId: "11",
    replayed: 1,
  });

  // Drain apply queue
  for (let i = 0; i < 5; i++) ctrl.applyFrame(true);
  assert.equal(ctrl.getSyncState(), "LIVE");
  assert.ok(ctrl.buildAck().liveSyncCompleted);
  assert.ok(ctrl.getDiagnostics().replayedUpdates >= 1);
  assert.equal(ctrl.runtime.getState().symbols.get("AAAA")?.momentumState, "BREAKING");
  messages.push("ok");
  assert.equal(messages.length, 1);
  ctrl.stop();
});

test("LiveSyncController: duplicate event ignored; out-of-order entity skipped", () => {
  type Es = {
    onmessage: ((ev: MessageEvent) => void) | null;
    onerror: ((ev: Event) => void) | null;
    close: () => void;
  };
  let esRef: Es | null = null;
  const ctrl = new MonitorLiveSyncController({
    initialSnapshot: snap(1),
    initialLastEventId: "1",
    eventSourceFactory: () => {
      esRef = {
        onmessage: null,
        onerror: null,
        close: () => {},
      };
      return esRef;
    },
  });
  ctrl.start();
  const delta = (seq: number, entity: number, intensity: number) =>
    esRef?.onmessage?.({
      data: JSON.stringify({
        type: "delta",
        id: String(seq),
        sequence: seq,
        priority: "state",
        payload: [
          {
            symbol: "AAAA",
            sequence: entity,
            asOfMs: 1,
            rank: 1,
            attentionPriority: 50,
            momentumState: "BUILDING",
            momentumIntensity: intensity,
            direction: "up",
            halted: false,
            criticalEvent: false,
            dataAvailability: "ok",
            stale: false,
          },
        ],
      }),
    } as MessageEvent);

  delta(2, 2, 0.8);
  delta(2, 2, 0.8); // duplicate event id/sequence
  delta(3, 1, 0.1); // stale entity version
  for (let i = 0; i < 5; i++) ctrl.applyFrame(true);
  assert.equal(ctrl.runtime.getState().symbols.get("AAAA")?.momentumIntensity, 0.8);
  ctrl.stop();
});

test("LiveSyncController: network offline → reconnecting keeps snapshot; online retries", () => {
  type Es = {
    onmessage: ((ev: MessageEvent) => void) | null;
    onerror: ((ev: Event) => void) | null;
    close: () => void;
  };
  let lastEs: Es | null = null;
  let opens = 0;
  const ctrl = new MonitorLiveSyncController({
    initialSnapshot: snap(5),
    initialLastEventId: "5",
    random: () => 0,
    eventSourceFactory: (): Es => {
      opens += 1;
      const es: Es = {
        onmessage: null,
        onerror: null,
        close: () => {},
      };
      lastEs = es;
      return es;
    },
  });
  ctrl.start();
  assert.equal(opens, 1);
  assert.ok(lastEs != null);
  (lastEs as Es).onerror?.({} as Event);
  assert.equal(ctrl.getSyncState(), "RECONNECTING");
  assert.equal(syncKeepsSnapshotVisible("RECONNECTING"), true);
  assert.ok(ctrl.runtime.getState().symbols.has("AAAA"));
  ctrl.onBrowserOnline();
  assert.ok(opens >= 2);
  ctrl.stop();
});

test("LiveSyncController: hidden tab flagged in diagnostics", () => {
  const ctrl = new MonitorLiveSyncController({
    initialSnapshot: snap(1),
    eventSourceFactory: () => ({
      onmessage: null,
      onerror: null,
      close: () => {},
    }),
  });
  ctrl.setDocumentHidden(true);
  assert.equal(ctrl.getDiagnostics().documentHidden, true);
  ctrl.setDocumentHidden(false);
  assert.equal(ctrl.getDiagnostics().documentHidden, false);
  ctrl.stop();
});
