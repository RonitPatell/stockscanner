import {
  EventTapeEngine,
  MemoryEventTapeStore,
  assignCluster,
  createClusterState,
  createDedupeState,
  decideDedupe,
  normalizeTapeSignal,
  rememberAccepted,
  type MonitorTapeItem,
  type RawTapeSignal,
} from "../../../domain/monitor/event-tape/index.ts";

function fixtureSignals(nowMs: number): RawTapeSignal[] {
  return [
    {
      type: "VERIFIED_CATALYST",
      symbol: "BBBB",
      atMs: nowMs - 42 * 60_000,
      detail: "FDA clearance wire verified.",
      dataConfidence: "high",
      sourceName: "GlobeNewswire",
      sourceUrl: "https://example.com/bbbb-fda",
    },
    {
      type: "MOMENTUM_BUILDING",
      symbol: "BBBB",
      atMs: nowMs - 30 * 60_000,
      dataConfidence: "high",
    },
    {
      type: "DILUTION_RISK",
      symbol: "BBBB",
      atMs: nowMs - 20 * 60_000,
      detail: "S-3 shelf linked.",
      dataConfidence: "medium",
    },
    {
      type: "VERIFIED_CATALYST",
      symbol: "AAAA",
      atMs: nowMs - 18 * 60_000,
      detail: "Contract expansion PR.",
      dataConfidence: "medium",
      sourceName: "Business Wire",
    },
    {
      type: "TRADE_RATE_BURST",
      symbol: "AAAA",
      atMs: nowMs - 14 * 60_000,
      dataConfidence: "medium",
    },
    {
      type: "MOMENTUM_BREAKING",
      symbol: "AAAA",
      atMs: nowMs - 12 * 60_000,
      dataConfidence: "medium",
    },
    {
      type: "HOD_BREAK",
      symbol: "AAAA",
      atMs: nowMs - 8 * 60_000,
      dataConfidence: "medium",
    },
    // Noisy repeat — cooled / deduped
    {
      type: "TRADE_RATE_BURST",
      symbol: "AAAA",
      atMs: nowMs - 14 * 60_000 + 8_000,
      dataConfidence: "medium",
    },
    {
      type: "HALTED",
      symbol: "FFFF",
      atMs: nowMs - 5 * 60_000,
      detail: "LULD / news pending.",
      dataConfidence: "high",
    },
    {
      type: "NEWS_RELEASED_DURING_HALT",
      symbol: "FFFF",
      atMs: nowMs - 4 * 60_000,
      dataConfidence: "medium",
    },
    {
      type: "VOLUME_BURST",
      symbol: "CCCC",
      atMs: nowMs - 15 * 60_000,
      dataConfidence: "medium",
    },
    {
      type: "MOMENTUM_FADING",
      symbol: "CCCC",
      atMs: nowMs - 10 * 60_000,
      dataConfidence: "medium",
    },
    {
      type: "SPREAD_WIDENING",
      symbol: "DDDD",
      atMs: nowMs - 7 * 60_000,
      dataConfidence: "low",
    },
    {
      type: "STALE_NEWS",
      symbol: "EEEE",
      atMs: nowMs - 25 * 60_000,
      dataConfidence: "medium",
    },
    {
      type: "DATA_DEGRADED",
      symbol: "AAAA",
      atMs: nowMs - 2 * 60_000,
      detail: "Quote lag elevated.",
      dataConfidence: "degraded",
    },
    {
      type: "OFFERING",
      symbol: "GGGG",
      atMs: nowMs - 55 * 60_000,
      dataConfidence: "high",
    },
    {
      type: "MOMENTUM_EMERGING",
      symbol: "HHHH",
      atMs: nowMs - 3 * 60_000,
      dataConfidence: "medium",
    },
    {
      type: "RESUMPTION_SCHEDULED",
      symbol: "FFFF",
      atMs: nowMs - 90_000,
      dataConfidence: "medium",
    },
  ];
}

/** Deterministic sync demo tape for Monitor fixtures. */
export function buildFixtureTapeSync(nowMs = Date.now()): MonitorTapeItem[] {
  const store = new MemoryEventTapeStore({ maxItems: 500 });
  const dedupe = createDedupeState();
  const clusters = createClusterState();
  const ordered = [...fixtureSignals(nowMs)].sort((a, b) => a.atMs - b.atMs);

  for (const signal of ordered) {
    const item = normalizeTapeSignal(signal);
    if (!item) continue;
    const decision = decideDedupe(item, dedupe, {
      cooldownMs: 45_000,
      hysteresisMs: 20_000,
      nowMs: item.atMs,
    });
    if (!decision.ok) continue;
    assignCluster(item, clusters, { windowMs: 120_000 });
    rememberAccepted(item, dedupe);
    store.appendSync([item]);
  }

  return store.listSync({ limit: 200 });
}

export async function buildFixtureTape(
  nowMs = Date.now()
): Promise<MonitorTapeItem[]> {
  const engine = new EventTapeEngine({
    store: new MemoryEventTapeStore({ maxItems: 500 }),
    cooldownMs: 45_000,
    hysteresisMs: 20_000,
    clusterWindowMs: 120_000,
  });
  await engine.ingest(fixtureSignals(nowMs));
  return engine.list({ limit: 200 });
}
