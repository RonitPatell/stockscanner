import type { MonitorLadderSnapshot } from "../../../domain/monitor/delivery/index.ts";
import { MONITOR_DELIVERY_VERSION } from "../../../domain/monitor/delivery/index.ts";
import type { MonitorPublicSnapshot } from "../../../domain/monitor/snapshot/index.ts";
import { providerAsOfMs } from "../../../domain/monitor/snapshot/index.ts";

/** Adapt Redis public snapshot → existing client ladder envelope. */
export function publicSnapshotToLadderSnapshot(
  snap: MonitorPublicSnapshot
): MonitorLadderSnapshot {
  const liveLabel = snap.freshness?.liveLabel;
  const health =
    snap.recovery || liveLabel === "recovery"
      ? "recovering"
      : liveLabel === "live"
        ? "live"
        : liveLabel === "aging" || snap.dataQuality === "degraded"
          ? "degraded"
          : liveLabel === "unavailable" || snap.dataQuality === "unavailable"
            ? "disconnected"
            : "stale";

  return {
    schemaVersion: MONITOR_DELIVERY_VERSION,
    sequence: Number(String(snap.lastEventId).replace(/\D+/g, "")) || 0,
    publishedAtMs: snap.generatedAtMs,
    health,
    symbols: snap.priorityLadder.map((t, i) => {
      const asOf = providerAsOfMs(t);
      const tickerStale =
        t.freshnessVerdict === "stale" ||
        t.freshnessVerdict === "unavailable" ||
        t.freshnessVerdict === "quarantined" ||
        t.dataConfidence === "LOW" ||
        t.dataConfidence === "UNAVAILABLE";
      return {
        symbol: t.symbol,
        sequence: i + 1,
        // Never fall back to generatedAtMs — missing provider time → 0 + unavailable.
        asOfMs: asOf ?? 0,
        rank: t.rank,
        attentionPriority: t.attentionPriority,
        momentumState: t.momentumState,
        momentumIntensity: t.momentumIntensity,
        direction:
          t.direction === "up" ||
          t.direction === "down" ||
          t.direction === "neutral"
            ? t.direction
            : null,
        halted: t.haltState === "halted" || t.haltState === "news_disseminated",
        criticalEvent:
          t.primaryRisk === "halt" || t.primaryRisk === "regulatory",
        dataAvailability:
          asOf == null
            ? "unavailable"
            : t.fieldFreshness?.find((f) => f.field === "quote")?.timeQuality ===
                "estimated"
              ? "estimated"
              : tickerStale
                ? "stale"
                : "ok",
        stale: tickerStale || asOf == null,
      };
    }),
    trackedSymbolCount: snap.priorityLadder.length,
    leaderSymbol: snap.globalLeader,
    dataNotes: [
      ...snap.sourceHealthSummary.notes,
      `publicSnapshot:${snap.snapshotId}`,
      snap.freshness
        ? `liveLabel:${snap.freshness.liveLabel}`
        : "liveLabel:unknown",
    ],
  };
}
