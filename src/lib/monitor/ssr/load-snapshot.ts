/**
 * Load Monitor snapshot for SSR first paint.
 *
 * Fallback order:
 * 1. Fresh Redis snapshot
 * 2. Stale-but-valid Redis snapshot
 * 3. Latest durable PostgreSQL snapshot
 * 4. Explicit unavailable
 *
 * Next.js 16.2 caching model for this route: request-time dynamic via auth().
 * Shared Redis/PG reads use Promise timeouts — not Next Data Cache / "use cache"
 * — so personalized prefs cannot be cross-user cached.
 */

import {
  validateMonitorPublicSnapshot,
  isSnapshotRenderable,
  type MonitorPublicSnapshot,
} from "../../../domain/monitor/snapshot/index.ts";
import { personalizeMonitorSnapshot, pickSelectedSymbol } from "./personalize.ts";
import {
  DEFAULT_MONITOR_UI_PREFS,
  MONITOR_REDIS_READ_TIMEOUT_MS,
  MONITOR_SNAPSHOT_FRESH_MAX_AGE_MS,
  type MonitorInitialSnapshot,
  type MonitorSnapshotSourceType,
  type MonitorUiPreferences,
} from "./types.ts";

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  onTimeout: () => T
): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(onTimeout());
    }, ms);
    promise
      .then((v) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(v);
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(onTimeout());
      });
  });
}

function ageMs(snap: MonitorPublicSnapshot, nowMs: number): number {
  // Underlying provider-input ages only — never serialization/generatedAt alone.
  const ages = [
    snap.freshness?.underlyingDataAgeMs,
    snap.marketStateAgeMs,
  ].filter((n): n is number => n != null && Number.isFinite(n));
  if (ages.length) return Math.max(0, ...ages);
  // Missing provider age → treat as maximally stale for classification.
  void nowMs;
  return Number.POSITIVE_INFINITY;
}

function classifyRedis(
  snap: MonitorPublicSnapshot,
  nowMs: number
): Extract<MonitorSnapshotSourceType, "REDIS_FRESH" | "REDIS_STALE"> {
  if (snap.freshness && !snap.freshness.liveEligible && !snap.recovery) {
    return "REDIS_STALE";
  }
  const age = ageMs(snap, nowMs);
  if (!Number.isFinite(age)) return "REDIS_STALE";
  return age <= MONITOR_SNAPSHOT_FRESH_MAX_AGE_MS
    ? "REDIS_FRESH"
    : "REDIS_STALE";
}

function unavailable(
  prefs: MonitorUiPreferences,
  code: string,
  message: string
): MonitorInitialSnapshot {
  const now = Date.now();
  return {
    ok: false,
    source: "UNAVAILABLE",
    generatedAt: new Date(now).toISOString(),
    generatedAtMs: now,
    dataAgeMs: null,
    lastEventId: null,
    snapshot: null,
    prefs,
    selectedSymbol: prefs.pinnedTicker,
    selectedSummary: null,
    error: { code, message },
  };
}

export interface LoadMonitorInitialSnapshotDeps {
  userId: string;
  nowMs?: number;
  deepLinkSymbol?: string | null;
  redisTimeoutMs?: number;
  readRedis: () => Promise<MonitorPublicSnapshot | null>;
  readPostgres: () => Promise<MonitorPublicSnapshot | null>;
  readPrefs: (userId: string) => Promise<MonitorUiPreferences>;
  /** Optional cold-start rebuild when Redis + PG have nothing. */
  bootstrapFromHub?: () => Promise<MonitorPublicSnapshot | null>;
}

/**
 * Pure orchestration (injectable IO). `userId` must come from session.
 */
export async function loadMonitorInitialSnapshotWithDeps(
  opts: LoadMonitorInitialSnapshotDeps
): Promise<MonitorInitialSnapshot> {
  const nowMs = opts.nowMs ?? Date.now();
  const timeout = opts.redisTimeoutMs ?? MONITOR_REDIS_READ_TIMEOUT_MS;

  const prefsPromise = opts.readPrefs(opts.userId);
  const redisPromise = withTimeout(opts.readRedis(), timeout, () => null);

  const [prefs, redisSnap] = await Promise.all([prefsPromise, redisPromise]);

  let snapshot: MonitorPublicSnapshot | null = null;
  let source: MonitorSnapshotSourceType = "UNAVAILABLE";

  if (redisSnap) {
    const v = validateMonitorPublicSnapshot(redisSnap);
    if (v.ok && isSnapshotRenderable(redisSnap)) {
      snapshot = redisSnap;
      source = classifyRedis(redisSnap, nowMs);
    }
  }

  if (!snapshot) {
    const pg = await opts.readPostgres();
    if (pg) {
      const v = validateMonitorPublicSnapshot(pg);
      if (v.ok && isSnapshotRenderable(pg)) {
        snapshot = pg;
        source = "POSTGRES_FALLBACK";
      }
    }
  }

  // Last resort on the request path: rebuild from the in-process delivery hub
  // so a cold Redis/PG does not brick the Scanner for every Pro session.
  if (!snapshot && opts.bootstrapFromHub) {
    try {
      const boot = await opts.bootstrapFromHub();
      if (boot) {
        const v = validateMonitorPublicSnapshot(boot);
        if (v.ok && isSnapshotRenderable(boot)) {
          snapshot = boot;
          source = boot.recovery ? "POSTGRES_FALLBACK" : "REDIS_STALE";
        }
      }
    } catch {
      /* keep unavailable */
    }
  }

  if (!snapshot) {
    return unavailable(
      prefs ?? DEFAULT_MONITOR_UI_PREFS,
      "SNAPSHOT_UNAVAILABLE",
      "Monitor market snapshot is unavailable right now."
    );
  }

  const personalized = personalizeMonitorSnapshot(snapshot, prefs);
  const selectedSymbol = pickSelectedSymbol(
    personalized,
    prefs,
    opts.deepLinkSymbol
  );
  const selectedSummary =
    personalized.priorityLadder.find((t) => t.symbol === selectedSymbol) ??
    personalized.momentumField.find((t) => t.symbol === selectedSymbol) ??
    null;

  return {
    ok: true,
    source,
    generatedAt: personalized.generatedAt,
    generatedAtMs: personalized.generatedAtMs,
    dataAgeMs: ageMs(personalized, nowMs),
    lastEventId: personalized.lastEventId,
    snapshot: personalized,
    prefs,
    selectedSymbol,
    selectedSummary,
    error: null,
  };
}

/**
 * Production entry — wires Redis / PG / prefs. Not imported by Node unit tests.
 */
export async function loadMonitorInitialSnapshot(opts: {
  userId: string;
  nowMs?: number;
  deepLinkSymbol?: string | null;
  redisTimeoutMs?: number;
}): Promise<MonitorInitialSnapshot> {
  const {
    getActiveMonitorPublicSnapshot,
    publishMonitorSnapshotFromHub,
    recoverMonitorSnapshotFromDurable,
  } = await import("../snapshot/service");
  const { loadLatestDurableMonitorSnapshot } = await import(
    "../snapshot/durable-store"
  );
  const { loadMonitorUiPreferencesForUser } = await import("./prefs");

  return loadMonitorInitialSnapshotWithDeps({
    ...opts,
    readRedis: () => getActiveMonitorPublicSnapshot(),
    readPostgres: () => loadLatestDurableMonitorSnapshot(),
    readPrefs: (id) => loadMonitorUiPreferencesForUser(id),
    bootstrapFromHub: async () => {
      await recoverMonitorSnapshotFromDurable().catch(() => null);
      await publishMonitorSnapshotFromHub({
        flush: true,
        recovery: true,
      }).catch(() => null);
      return getActiveMonitorPublicSnapshot();
    },
  });
}
