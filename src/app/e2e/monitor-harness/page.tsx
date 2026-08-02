import { notFound } from "next/navigation";
import { isE2eWorkflowHarnessAllowed } from "@/lib/e2e-harness";
import { MonitorHarnessClient } from "./MonitorHarnessClient";
import {
  buildMonitorStartupHarness,
  isMonitorStartupScenario,
} from "@/components/monitor/startup-fixtures";

export const dynamic = "force-dynamic";

/**
 * Seeded TrustTicker Monitor harness for Playwright.
 * Gated by ALLOW_E2E_HARNESS / local development — not available in production.
 *
 * ?scenario=quiet|emerging|…|startup_active|startup_burst|…
 * Startup scenarios include a server-passed initialSnapshot so first HTML
 * contains real seeded ladder content before hydration.
 */
export default async function MonitorE2eHarnessPage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string }>;
}) {
  if (!isE2eWorkflowHarnessAllowed()) notFound();
  const sp = await searchParams;
  const raw = sp.scenario ?? null;

  if (isMonitorStartupScenario(raw)) {
    const seed = buildMonitorStartupHarness(raw);
    return (
      <MonitorHarnessClient
        scenarioParam={raw}
        initialSnapshot={seed.initialSnapshot}
        e2eSeed={seed.e2eSeed}
        expectedTicker={seed.expectedTicker}
      />
    );
  }

  return <MonitorHarnessClient scenarioParam={raw} />;
}
