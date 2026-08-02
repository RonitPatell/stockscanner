import type { MonitorSnapshotTicker } from "../../../domain/monitor/snapshot/index.ts";
import type { MonitorLadderRow } from "../../../components/monitor/monitor-types.ts";

function tierFromPriority(p: number | null): MonitorLadderRow["tier"] {
  if (p == null) return "LOW";
  if (p >= 80) return "CRITICAL";
  if (p >= 60) return "HIGH";
  if (p >= 35) return "MEDIUM";
  return "LOW";
}

/** Map SSR public tickers → client ladder rows (first paint). */
export function snapshotTickersToLadderRows(
  tickers: MonitorSnapshotTicker[]
): MonitorLadderRow[] {
  return tickers.map((t) => ({
    symbol: t.symbol,
    rank: t.rank ?? 999,
    attentionPriority: t.attentionPriority ?? 0,
    tier: tierFromPriority(t.attentionPriority),
    momentumState: t.momentumState ?? "UNKNOWN",
    momentumIntensity: t.momentumIntensity ?? 0,
    direction:
      t.direction === "up" || t.direction === "down" || t.direction === "neutral"
        ? t.direction
        : "neutral",
    reason:
      t.haltState === "halted"
        ? "Halt"
        : t.catalyst?.verified
          ? "Verified catalyst"
          : "Server snapshot",
    onWatchlist: false,
    halted: t.haltState === "halted" || t.haltState === "news_disseminated",
    criticalEvent: t.primaryRisk === "halt" || t.primaryRisk === "regulatory",
    dataConfidenceWarning:
      t.dataConfidence === "LOW" || t.dataConfidence === "UNAVAILABLE",
    hasCatalyst: Boolean(t.catalyst),
    catalystVerified: Boolean(t.catalyst?.verified),
  }));
}
