"use client";

import { useMemo } from "react";
import { TrustTickerMonitor } from "@/components/monitor/TrustTickerMonitor";
import {
  buildMonitorE2eSeed,
  parseMonitorE2eScenario,
  MONITOR_E2E_SCENARIOS,
  type MonitorE2eSeed,
  type MonitorE2eScenarioId,
} from "@/components/monitor/e2e-scenarios";
import { MONITOR_STARTUP_SCENARIOS } from "@/components/monitor/startup-fixtures";
import type { MonitorInitialSnapshot } from "@/lib/monitor/ssr/types";

export function MonitorHarnessClient({
  scenarioParam,
  initialSnapshot = null,
  e2eSeed: e2eSeedProp = null,
  expectedTicker = null,
}: {
  scenarioParam: string | null;
  /** Server-passed SSR bootstrap for startup scenarios. */
  initialSnapshot?: MonitorInitialSnapshot | null;
  e2eSeed?: MonitorE2eSeed | null;
  expectedTicker?: string | null;
}) {
  const scenario = parseMonitorE2eScenario(
    e2eSeedProp?.scenario ?? scenarioParam
  );
  const seed = useMemo(
    () => e2eSeedProp ?? buildMonitorE2eSeed(scenario),
    [e2eSeedProp, scenario]
  );
  const displayScenario = scenarioParam ?? scenario;

  return (
    <div
      className="min-h-screen bg-[var(--mon-bg,#0b0f14)] text-[var(--mon-text,#e8eef5)]"
      data-testid="monitor-e2e-harness"
      data-scenario={displayScenario}
      data-expected-ticker={expectedTicker ?? ""}
      data-ssr-bootstrap={initialSnapshot ? "true" : "false"}
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-2 text-xs">
        <strong data-testid="monitor-e2e-title">Monitor E2E harness</strong>
        <span className="text-zinc-500">scenario={displayScenario}</span>
        <nav className="flex flex-wrap gap-1" aria-label="Scenario switcher">
          {[...MONITOR_E2E_SCENARIOS, ...MONITOR_STARTUP_SCENARIOS].map((id) => (
            <a
              key={id}
              href={`/e2e/monitor-harness?scenario=${id}`}
              data-testid={`monitor-e2e-link-${id}`}
              className={
                id === displayScenario
                  ? "rounded bg-emerald-900/50 px-2 py-0.5 text-emerald-200"
                  : "rounded px-2 py-0.5 text-zinc-400 hover:bg-zinc-800"
              }
            >
              {id}
            </a>
          ))}
        </nav>
      </header>
      <TrustTickerMonitor e2eSeed={seed} initialSnapshot={initialSnapshot} />
    </div>
  );
}

export type { MonitorE2eScenarioId };
