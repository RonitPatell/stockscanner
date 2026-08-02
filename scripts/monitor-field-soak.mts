/**
 * Sustained Momentum Field layout soak (pure layout path).
 *
 * Default: 30s. Two-hour: --hours=2
 * Visual rAF lives in the browser; this validates sustained layout churn + RSS.
 */
import { performance } from "node:perf_hooks";
import { layoutMomentumField } from "../src/components/monitor/field/field-layout.ts";
import type { MomentumFieldNode } from "../src/components/monitor/field/field-types.ts";
import { FIELD_MAX_NODES } from "../src/components/monitor/field/field-types.ts";

const hoursArg = process.argv.find((a) => a.startsWith("--hours="));
const hours = hoursArg ? Number(hoursArg.split("=")[1]) : 0;
const durationMs = hours > 0 ? hours * 3600_000 : 30_000;

function makeNodes(tick: number): MomentumFieldNode[] {
  return Array.from({ length: 16 }, (_, i) => {
    const states = [
      "BREAKING",
      "ACTIVE",
      "BUILDING",
      "EMERGING",
      "COOLING",
      "FADING",
      "HALTED",
    ];
    const state = states[(i + tick) % states.length]!;
    return {
      symbol: `T${(i + (tick % 5)) % 20}`,
      rank: i + 1,
      previousRank: i === 0 ? 3 : i + 2,
      attentionPriority: 30 + ((i * 17 + tick) % 70),
      momentumState: state,
      direction: i % 2 === 0 ? "up" : "down",
      accelerationNorm: (i % 5) / 5,
      risk: state === "HALTED" ? "critical" : "low",
      verifiedCatalyst: i % 4 === 0,
      sourceUrl: null,
      dataFreshnessMs: 500 + (tick % 20) * 100,
      dataQualityWarning: i % 7 === 0,
      halted: state === "HALTED",
      onWatchlist: i % 3 === 0,
      muted: false,
      pinned: false,
      isLeader: i === 0 && state !== "HALTED",
    };
  });
}

const startRss = process.memoryUsage().rss;
const start = performance.now();
let iterations = 0;
let maxRss = startRss;

console.log(
  `[field-soak] duration=${durationMs}ms maxNodes=${FIELD_MAX_NODES} startRssMb=${(
    startRss /
    1024 /
    1024
  ).toFixed(1)}`
);

while (performance.now() - start < durationMs) {
  const layout = layoutMomentumField(makeNodes(iterations));
  if (layout.points.length > FIELD_MAX_NODES) {
    throw new Error("cap breached");
  }
  iterations += 1;
  if (iterations % 2000 === 0) {
    const rss = process.memoryUsage().rss;
    maxRss = Math.max(maxRss, rss);
    void layout.points[0]?.x;
  }
}

const endRss = process.memoryUsage().rss;
const elapsed = performance.now() - start;
const growthMb = (endRss - startRss) / 1024 / 1024;

console.log(
  JSON.stringify(
    {
      iterations,
      elapsedMs: Math.round(elapsed),
      layoutsPerSec: Math.round(iterations / (elapsed / 1000)),
      startRssMb: +(startRss / 1024 / 1024).toFixed(1),
      endRssMb: +(endRss / 1024 / 1024).toFixed(1),
      maxRssMb: +(maxRss / 1024 / 1024).toFixed(1),
      rssGrowthMb: +growthMb.toFixed(1),
    },
    null,
    2
  )
);

if (durationMs <= 60_000 && growthMb > 256) {
  console.error("[field-soak] FAIL: excessive RSS growth");
  process.exit(1);
}
console.log("[field-soak] ok");
