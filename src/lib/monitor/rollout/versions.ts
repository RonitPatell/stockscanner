/**
 * Build + engine versions for admin diagnostics.
 * Observational only — not service guarantees.
 */

import { MONITOR_ROLLOUT_VERSION } from "@/domain/monitor/rollout";
import { MONITOR_OPS_VERSION } from "@/domain/monitor/ops";
import { MONITOR_DELIVERY_VERSION } from "@/domain/monitor/delivery";
import { MONITOR_MOMENTUM_VERSION } from "@/domain/monitor/momentum/version";
import { MONITOR_ATTENTION_VERSION } from "@/domain/monitor/attention/version";
import { MONITOR_MOMENTUM_STATE_VERSION } from "@/domain/monitor/momentum-state/version";
import { MONITOR_MARKET_STATE_VERSION } from "@/domain/monitor/market-state/version";
import { MONITOR_CALIBRATION_VERSION } from "@/domain/monitor/calibration/version";
import { MONITOR_REPLAY_VERSION } from "@/domain/monitor/replay/version";

export interface MonitorBuildDiagnostics {
  buildId: string;
  gitSha: string | null;
  nodeEnv: string;
  rolloutControlVersion: string;
  engines: Array<{ id: string; version: string }>;
  disclaimer: string;
}

export function getMonitorBuildDiagnostics(): MonitorBuildDiagnostics {
  const gitSha =
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.GIT_COMMIT_SHA?.trim() ||
    null;
  const buildId =
    process.env.VERCEL_DEPLOYMENT_ID?.trim() ||
    process.env.NEXT_PUBLIC_BUILD_ID?.trim() ||
    gitSha ||
    `local-${process.env.npm_package_version ?? "0.0.0"}`;

  return {
    buildId,
    gitSha,
    nodeEnv: process.env.NODE_ENV ?? "unknown",
    rolloutControlVersion: MONITOR_ROLLOUT_VERSION,
    engines: [
      { id: "ops", version: MONITOR_OPS_VERSION },
      { id: "delivery", version: MONITOR_DELIVERY_VERSION },
      { id: "momentum", version: MONITOR_MOMENTUM_VERSION },
      { id: "attention", version: MONITOR_ATTENTION_VERSION },
      { id: "momentumState", version: MONITOR_MOMENTUM_STATE_VERSION },
      { id: "marketState", version: MONITOR_MARKET_STATE_VERSION },
      { id: "calibration", version: MONITOR_CALIBRATION_VERSION },
      { id: "replay", version: MONITOR_REPLAY_VERSION },
      { id: "rollout", version: MONITOR_ROLLOUT_VERSION },
    ],
    disclaimer:
      "Build and engine versions are diagnostic labels only. They are not latency, uptime, or profitability guarantees.",
  };
}
