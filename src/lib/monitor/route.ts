/**
 * Canonical Monitor dashboard route (shell V3 + view=monitor).
 * Prefer this over bare `/dashboard` so Link/router prefetch hit the Monitor RSC payload.
 */

import { isMonitorV1Enabled } from "./flags.ts";
import { MONITOR_ROUTE_HREF } from "./prefetch-gate.ts";

export const MONITOR_ROUTE_PATH = "/dashboard";
export const MONITOR_VIEW_PARAM = "monitor";

/** Absolute path + query for the Monitor destination. */
export function monitorRouteHref(extra?: Record<string, string>): string {
  if (!extra || Object.keys(extra).length === 0) {
    return MONITOR_ROUTE_HREF;
  }
  const q = new URLSearchParams({ view: MONITOR_VIEW_PARAM, ...extra });
  return `${MONITOR_ROUTE_PATH}?${q.toString()}`;
}

/**
 * Default post-auth / nav target for entitled users.
 * Falls back to bare dashboard when Monitor flag is off.
 */
export function entitledDashboardHref(): string {
  return isMonitorV1Enabled() ? monitorRouteHref() : MONITOR_ROUTE_PATH;
}
