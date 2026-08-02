import type { MomentumFieldNode } from "./field-types.ts";

function freshnessLabel(ms: number | null): string {
  if (ms == null) return "freshness unknown";
  if (ms < 1000) return "freshness under 1 second";
  if (ms < 60_000) return `freshness ${Math.round(ms / 1000)} seconds`;
  return `freshness ${Math.round(ms / 60_000)} minutes`;
}

function directionLabel(d: MomentumFieldNode["direction"]): string {
  if (d === "up") return "upward";
  if (d === "down") return "downward";
  return "neutral direction";
}

function riskLabel(r: MomentumFieldNode["risk"]): string {
  if (r === "none") return "no elevated risk flag";
  return `${r} risk`;
}

function rankChangeLabel(node: MomentumFieldNode): string {
  if (node.previousRank == null) return "new to field";
  const d = node.previousRank - node.rank;
  if (d > 0) return `rank up ${d}`;
  if (d < 0) return `rank down ${Math.abs(d)}`;
  return "rank unchanged";
}

/**
 * Accessible name — must not rely on position/animation/colour alone.
 * Includes ticker, rank, momentum state, direction, risk, data freshness.
 */
export function fieldNodeAccessibleName(node: MomentumFieldNode): string {
  const parts = [
    node.symbol,
    `rank ${node.rank}`,
    `momentum state ${node.momentumState}`,
    directionLabel(node.direction),
    riskLabel(node.risk),
    freshnessLabel(node.dataFreshnessMs),
  ];
  if (node.isLeader) parts.push("current leader");
  if (node.halted) parts.push("halted");
  if (node.pinned) parts.push("pinned");
  if (node.muted) parts.push("muted");
  if (node.verifiedCatalyst) parts.push("verified catalyst");
  if (node.dataQualityWarning) parts.push("data quality warning");
  if (node.onWatchlist) parts.push("on watchlist");
  parts.push(rankChangeLabel(node));
  parts.push(`attention priority ${Math.round(node.attentionPriority)}`);
  return parts.join(", ");
}

/** Concise hover tooltip — inspection only, not a trade cue. */
export function fieldNodeTooltip(node: MomentumFieldNode): string {
  const dir =
    node.direction === "up" ? "↑" : node.direction === "down" ? "↓" : "·";
  const bits = [
    `${node.symbol} · ${node.momentumState} ${dir}`,
    `Priority ${Math.round(node.attentionPriority)} · rank #${node.rank}`,
  ];
  if (node.isLeader) bits.push("Global leader");
  if (node.pinned) bits.push("Pinned");
  if (node.risk !== "none") bits.push(`Risk ${node.risk}`);
  if (node.dataQualityWarning) bits.push("Data quality warning");
  if (node.halted) bits.push("Halted — motion stopped");
  return bits.join(" · ");
}

/**
 * Opacity for stale / low-confidence / muted nodes.
 * Halted stays readable but calm (no motion elsewhere).
 */
export function fieldNodeOpacity(node: MomentumFieldNode): number {
  if (node.muted) return 0.42;
  if (node.dataQualityWarning) return 0.58;
  if (node.dataFreshnessMs != null && node.dataFreshnessMs > 15_000) return 0.62;
  if (node.halted) return 0.88;
  return 1;
}

/**
 * At most one node may pulse — highest meaningful acceleration.
 * Returns null when reduced-motion, hidden, halted-only, or below threshold.
 */
export function selectPulseSymbol(
  nodes: readonly MomentumFieldNode[],
  opts: { reducedMotion: boolean; visible: boolean }
): string | null {
  if (opts.reducedMotion || !opts.visible) return null;
  let best: MomentumFieldNode | null = null;
  for (const n of nodes) {
    if (n.halted || n.muted) continue;
    if (n.accelerationNorm < 0.55) continue;
    if (
      !best ||
      n.accelerationNorm > best.accelerationNorm ||
      (n.accelerationNorm === best.accelerationNorm && n.rank < best.rank)
    ) {
      best = n;
    }
  }
  return best?.symbol ?? null;
}

/**
 * Legacy helper: period for a one-shot pulse animation (seconds), or null.
 * Continuous looping pulse is not used — call sites should prefer selectPulseSymbol.
 */
export function pulsePeriodSec(
  accelerationNorm: number,
  opts: { reducedMotion: boolean; visible: boolean }
): number | null {
  if (opts.reducedMotion || !opts.visible) return null;
  const a = Math.max(0, Math.min(1, accelerationNorm));
  if (a < 0.55) return null;
  // Single cycle ~0.7–1.1s — not a continuous bounce
  return 0.7 + (1 - a) * 0.4;
}
