/**
 * Authenticated Monitor route prefetch + critical-asset warming.
 *
 * - Prefetch the Monitor RSC route (not the live snapshot API).
 * - Warm only first-paint chunks (shell / ladder / field).
 * - Never prefetch for users without Pro + Monitor access.
 * - Do not poll `/api/monitor/snapshot` from marketing pages.
 */

import { isMonitorV1Enabled } from "./flags.ts";
import { monitorRouteHref } from "./route.ts";
import {
  canPrefetchMonitor as canPrefetchStrict,
  prefetchMonitorRouteOnce,
  type AppRouterPrefetch,
  type MonitorPrefetchAccess,
} from "./prefetch-gate.ts";
import {
  monitorPerfMark,
  recordMonitorPrefetchMetrics,
} from "./perf-marks.ts";

export type { MonitorPrefetchAccess, AppRouterPrefetch } from "./prefetch-gate.ts";

let routePrefetched = false;
let assetsWarmed = false;
const routeState = { done: false };

export function resolvePrefetchAccess(
  access: MonitorPrefetchAccess
): MonitorPrefetchAccess {
  return {
    subscribed: access.subscribed,
    monitorEnabled:
      access.monitorEnabled != null
        ? access.monitorEnabled
        : isMonitorV1Enabled(),
  };
}

export function canPrefetchMonitor(access: MonitorPrefetchAccess): boolean {
  return canPrefetchStrict(resolvePrefetchAccess(access));
}

export function resetMonitorPrefetchStateForTests(): void {
  routePrefetched = false;
  assetsWarmed = false;
  routeState.done = false;
}

/**
 * Prefetch Monitor route once. Safe to call from hover/focus/auth success.
 * Does not fetch market snapshot JSON.
 */
export async function prefetchMonitorRoute(
  router: AppRouterPrefetch,
  access: MonitorPrefetchAccess,
  opts?: { force?: boolean; href?: string }
): Promise<boolean> {
  const resolved = resolvePrefetchAccess(access);
  if (!canPrefetchStrict(resolved)) return false;
  if (routePrefetched && !opts?.force) return false;

  monitorPerfMark("monitor_route_prefetch_start", { once: false });
  const result = await prefetchMonitorRouteOnce(router, resolved, routeState, {
    force: opts?.force,
    href: opts?.href ?? monitorRouteHref(),
  });
  if (!result.ok) return false;

  routePrefetched = true;
  monitorPerfMark("monitor_route_prefetch_done", {
    once: false,
    detail: `${Math.round(result.ms)}ms`,
  });
  recordMonitorPrefetchMetrics({
    routePrefetchMs: result.ms,
    href: result.href,
  });
  return true;
}

/**
 * Warm critical Monitor JS (shell + ladder + field entry).
 * Explicitly avoids autopsy, dilution radar, replay, admin, CSV, broadcast.
 */
export async function warmMonitorCriticalAssets(
  access: MonitorPrefetchAccess
): Promise<boolean> {
  if (!canPrefetchMonitor(access)) return false;
  if (assetsWarmed) return false;
  assetsWarmed = true;
  monitorPerfMark("monitor_critical_warm_start", { once: false });

  try {
    await Promise.all([
      import("../../components/monitor/TrustTickerMonitor.tsx"),
      import("../../components/monitor/ladder/PriorityLadder.tsx"),
      import("../../components/monitor/field/MomentumField.tsx"),
      import("../../components/monitor/states/MonitorLoadingSkeleton.tsx"),
    ]);
    monitorPerfMark("monitor_critical_warm_done", { once: false });
    return true;
  } catch {
    assetsWarmed = false;
    return false;
  }
}

/** Intentional hover/focus of Monitor nav — route prefetch only (cheap). */
export function prefetchMonitorOnIntent(
  router: AppRouterPrefetch,
  access: MonitorPrefetchAccess
): void {
  void prefetchMonitorRoute(router, access);
}
