import type { HaltProvider, HaltProviderEvent, HaltRecord } from "./types.ts";
import { applyEventStream, reconcileHaltEvents } from "./reconcile.ts";
import {
  appendTransition,
  getActiveHalt,
  listActiveHalts,
  upsertActiveHalt,
} from "./store.ts";
import { emitHaltTransitionAlert } from "./alerts.ts";
import { associateCatalystsDuringHalt } from "./associate.ts";
import { defaultHaltProviders } from "./providers/index.ts";
import { getRedis } from "../redis.ts";

const HEARTBEAT_KEY = "halt:provider:hb:";
const memoryHb = new Map<string, number>();

async function beat(providerId: string): Promise<void> {
  const now = Date.now();
  memoryHb.set(providerId, now);
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(HEARTBEAT_KEY + providerId, now, { ex: 3600 });
    } catch {
      /* ignore */
    }
  }
}

export async function providerHeartbeatAgeMs(
  providerId: string
): Promise<number | null> {
  const redis = getRedis();
  if (redis) {
    try {
      const v = await redis.get<number>(HEARTBEAT_KEY + providerId);
      if (typeof v === "number") return Date.now() - v;
    } catch {
      /* memory */
    }
  }
  const t = memoryHb.get(providerId);
  return t != null ? Date.now() - t : null;
}

/**
 * Ingest a batch of provider events (may be out of order / multi-provider).
 */
export async function ingestHaltEvents(
  events: HaltProviderEvent[],
  opts?: { associate?: boolean }
): Promise<{ records: HaltRecord[]; alertsEmitted: number }> {
  const bySymbol = new Map<string, HaltProviderEvent[]>();
  for (const ev of events) {
    const s = ev.symbol.toUpperCase();
    const arr = bySymbol.get(s) ?? [];
    arr.push({ ...ev, symbol: s });
    bySymbol.set(s, arr);
  }

  const records: HaltRecord[] = [];
  let alertsEmitted = 0;

  for (const [symbol, evs] of bySymbol) {
    const prior = await getActiveHalt(symbol);
    const applied = applyEventStream({ symbol, events: evs, prior });
    let record = applied.record;
    if (opts?.associate !== false) {
      record = await associateCatalystsDuringHalt(record);
    }
    await upsertActiveHalt(record);
    for (const t of applied.transitions) {
      const { emitted } = await emitHaltTransitionAlert(record, t);
      if (emitted) alertsEmitted++;
      await appendTransition(t);
    }
    records.push(record);
  }

  return { records, alertsEmitted };
}

/**
 * Poll providers; on missing heartbeats, force official-source recovery poll.
 */
export async function pollHaltProviders(opts?: {
  providers?: HaltProvider[];
  symbols?: string[];
  expectedIntervalMs?: number;
}): Promise<{
  fetched: number;
  records: HaltRecord[];
  recoveryPoll: boolean;
  alertsEmitted: number;
}> {
  const providers = opts?.providers ?? defaultHaltProviders();
  const expected = opts?.expectedIntervalMs ?? 60_000;
  let recoveryPoll = false;

  for (const p of providers) {
    const age = await providerHeartbeatAgeMs(p.id);
    if (age != null && age > expected * 2.5 && p.kind === "official_exchange") {
      recoveryPoll = true;
    }
  }

  const events: HaltProviderEvent[] = [];
  for (const p of providers) {
    // On recovery, always hit official; otherwise all configured providers
    if (recoveryPoll && p.kind !== "official_exchange") continue;
    try {
      const batch = await p.fetchHalts(opts?.symbols);
      events.push(...batch);
      await beat(p.id);
    } catch {
      /* continue */
    }
  }

  // If no recovery but official missed while we have active halts, recovery poll official only
  if (!recoveryPoll && events.length === 0) {
    const active = await listActiveHalts();
    const open = active.filter(
      (h) =>
        h.lifecycle === "halted" ||
        h.lifecycle === "news_disseminated" ||
        h.lifecycle === "resumption_quote_scheduled"
    );
    if (open.length > 0) {
      recoveryPoll = true;
      const official = providers.find((p) => p.kind === "official_exchange");
      if (official) {
        try {
          const batch = await official.fetchHalts(open.map((h) => h.symbol));
          events.push(...batch);
          await beat(official.id);
        } catch {
          /* ignore */
        }
      }
    }
  }

  const result = await ingestHaltEvents(events);
  return {
    fetched: events.length,
    records: result.records,
    recoveryPoll,
    alertsEmitted: result.alertsEmitted,
  };
}

/** Apply a single reconciled event (tests / stream). */
export async function applySingleProviderEvent(
  event: HaltProviderEvent
): Promise<HaltRecord> {
  const prior = await getActiveHalt(event.symbol);
  const { record, transition } = reconcileHaltEvents({
    symbol: event.symbol,
    events: [event],
    prior,
  });
  let next = await associateCatalystsDuringHalt(record);
  await upsertActiveHalt(next);
  if (transition) {
    await emitHaltTransitionAlert(next, transition);
    await appendTransition(transition);
  }
  return next;
}
