/**
 * Pure entitlement gate + route prefetch helpers (no Next/@ imports).
 * Safe for Node unit tests.
 */

export type MonitorPrefetchAccess = {
  subscribed: boolean;
  /** When omitted, caller must resolve via isMonitorV1Enabled before warming. */
  monitorEnabled?: boolean;
};

export type AppRouterPrefetch = {
  prefetch: (href: string) => void | Promise<void>;
};

export const MONITOR_ROUTE_HREF = "/dashboard?view=monitor";

/**
 * Prefetch only when Pro + Monitor access.
 * If `monitorEnabled` is omitted, returns false (fail closed for callers
 * that have not resolved the flag yet).
 */
export function canPrefetchMonitor(access: MonitorPrefetchAccess): boolean {
  if (!access.subscribed) return false;
  if (access.monitorEnabled !== true) return false;
  return true;
}

export async function prefetchMonitorRouteOnce(
  router: AppRouterPrefetch,
  access: MonitorPrefetchAccess,
  state: { done: boolean },
  opts?: { force?: boolean; href?: string }
): Promise<{ ok: boolean; ms: number; href: string }> {
  const href = opts?.href ?? MONITOR_ROUTE_HREF;
  if (!canPrefetchMonitor(access)) {
    return { ok: false, ms: 0, href };
  }
  if (state.done && !opts?.force) {
    return { ok: false, ms: 0, href };
  }
  const t0 =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  await Promise.resolve(router.prefetch(href));
  state.done = true;
  const t1 =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  return { ok: true, ms: t1 - t0, href };
}
