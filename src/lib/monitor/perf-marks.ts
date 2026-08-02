/**
 * Temporary Monitor initial-load performance marks (development / opt-in).
 *
 * Marks:
 * - monitor_navigation_start
 * - monitor_html_received
 * - monitor_hydration_complete
 * - monitor_snapshot_rendered
 * - monitor_first_visible_ticker
 * - monitor_stream_connected
 * - monitor_live_synced
 * - monitor_interactive
 * - monitor_route_prefetch_start / _done
 * - monitor_critical_warm_start / _done
 *
 * Enable with NODE_ENV=development or NEXT_PUBLIC_MONITOR_PERF_MARKS=1.
 * Inspect: performance.getEntriesByType("mark"), window.__MONITOR_PERF__,
 * or window.__MONITOR_PERF_METRICS__.
 *
 * Do not treat these as production telemetry.
 */

export type MonitorPerfMarkName =
  | "monitor_navigation_start"
  | "monitor_html_received"
  | "monitor_hydration_complete"
  | "monitor_snapshot_rendered"
  | "monitor_first_visible_ticker"
  | "monitor_stream_connected"
  | "monitor_live_synced"
  | "monitor_interactive"
  | "monitor_route_prefetch_start"
  | "monitor_route_prefetch_done"
  | "monitor_critical_warm_start"
  | "monitor_critical_warm_done";

export type MonitorLoadMetrics = {
  /** Sum of transferSize for script resources matching monitor/critical patterns. */
  criticalJavaScriptBytes: number | null;
  /** Duration of last route prefetch attempt (ms). */
  routePrefetchMs: number | null;
  /** Navigation transferSize (initial document), bytes. */
  initialPageTransferBytes: number | null;
  /** hydration_complete − html_received (ms). */
  hydrationDurationMs: number | null;
  /** first_visible_ticker − navigation_start (ms). */
  timeToFirstVisibleTickerMs: number | null;
  /** interactive − navigation_start (ms). */
  timeToInteractiveMs: number | null;
  routePrefetchHref?: string;
  collectedAtMs: number;
};

type PerfEntry = { name: MonitorPerfMarkName; t: number; detail?: string };

declare global {
  interface Window {
    __MONITOR_PERF__?: PerfEntry[];
    __MONITOR_PERF_METRICS__?: MonitorLoadMetrics;
  }
}

function marksEnabled(): boolean {
  if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
    return true;
  }
  if (
    typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_MONITOR_PERF_MARKS === "1"
  ) {
    return true;
  }
  return false;
}

const once = new Set<string>();

/** Fire a named Performance mark once (unless { once: false }). */
export function monitorPerfMark(
  name: MonitorPerfMarkName,
  opts?: { once?: boolean; detail?: string }
): void {
  if (!marksEnabled()) return;
  if (typeof performance === "undefined") return;
  const onlyOnce = opts?.once !== false;
  if (onlyOnce && once.has(name)) return;
  if (onlyOnce) once.add(name);
  try {
    performance.mark(name);
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") {
    window.__MONITOR_PERF__ = window.__MONITOR_PERF__ ?? [];
    window.__MONITOR_PERF__.push({
      name,
      t: performance.now(),
      detail: opts?.detail,
    });
  }
}

/** Navigation Timing → html received (client). */
export function monitorPerfMarkHtmlReceived(): void {
  if (!marksEnabled()) return;
  if (typeof performance === "undefined") return;
  try {
    const nav = performance.getEntriesByType(
      "navigation"
    )[0] as PerformanceNavigationTiming | undefined;
    if (nav && Number.isFinite(nav.responseStart)) {
      monitorPerfMark("monitor_html_received", {
        detail: `responseStart=${Math.round(nav.responseStart)}ms`,
      });
    } else {
      monitorPerfMark("monitor_html_received");
    }
  } catch {
    monitorPerfMark("monitor_html_received");
  }
}

/** Measure between two marks when both exist. */
export function monitorPerfMeasure(
  name: string,
  startMark: MonitorPerfMarkName,
  endMark: MonitorPerfMarkName
): number | null {
  if (!marksEnabled()) return null;
  try {
    performance.measure(name, startMark, endMark);
    const entries = performance.getEntriesByName(name, "measure");
    const last = entries[entries.length - 1];
    return last ? last.duration : null;
  } catch {
    return null;
  }
}

function markTime(name: MonitorPerfMarkName): number | null {
  if (typeof performance === "undefined") return null;
  const entries = performance.getEntriesByName(name, "mark");
  const last = entries[entries.length - 1] as PerformanceMark | undefined;
  return last ? last.startTime : null;
}

function sumCriticalScriptBytes(): number | null {
  if (typeof performance === "undefined") return null;
  try {
    const resources = performance.getEntriesByType(
      "resource"
    ) as PerformanceResourceTiming[];
    let sum = 0;
    let matched = 0;
    for (const r of resources) {
      if (r.initiatorType !== "script" && !r.name.includes(".js")) continue;
      const n = r.name.toLowerCase();
      // Heuristic: Monitor critical chunks + shared framework for the route.
      if (
        n.includes("trusttickermonitor") ||
        n.includes("priorityladder") ||
        n.includes("momentumfield") ||
        n.includes("monitor-") ||
        n.includes("/monitor/") ||
        n.includes("dashboard")
      ) {
        const size = r.transferSize || r.encodedBodySize || 0;
        if (size > 0) {
          sum += size;
          matched += 1;
        }
      }
    }
    return matched > 0 ? sum : null;
  } catch {
    return null;
  }
}

function initialDocumentTransferBytes(): number | null {
  if (typeof performance === "undefined") return null;
  try {
    const nav = performance.getEntriesByType(
      "navigation"
    )[0] as PerformanceNavigationTiming | undefined;
    if (!nav) return null;
    const size = nav.transferSize || nav.encodedBodySize || 0;
    return size > 0 ? size : null;
  } catch {
    return null;
  }
}

let lastPrefetchMs: number | null = null;
let lastPrefetchHref: string | undefined;

export function recordMonitorPrefetchMetrics(input: {
  routePrefetchMs: number;
  href: string;
}): void {
  lastPrefetchMs = input.routePrefetchMs;
  lastPrefetchHref = input.href;
  if (!marksEnabled() || typeof window === "undefined") return;
  const prev = window.__MONITOR_PERF_METRICS__;
  window.__MONITOR_PERF_METRICS__ = {
    ...(prev ?? emptyMetrics()),
    routePrefetchMs: input.routePrefetchMs,
    routePrefetchHref: input.href,
    collectedAtMs: Date.now(),
  };
}

function emptyMetrics(): MonitorLoadMetrics {
  return {
    criticalJavaScriptBytes: null,
    routePrefetchMs: lastPrefetchMs,
    initialPageTransferBytes: null,
    hydrationDurationMs: null,
    timeToFirstVisibleTickerMs: null,
    timeToInteractiveMs: null,
    routePrefetchHref: lastPrefetchHref,
    collectedAtMs: Date.now(),
  };
}

/**
 * Aggregate measurable load path stats into window.__MONITOR_PERF_METRICS__.
 * Call after interactive (or from diagnostics).
 */
export function collectMonitorLoadMetrics(): MonitorLoadMetrics | null {
  if (!marksEnabled()) return null;
  if (typeof performance === "undefined" || typeof window === "undefined") {
    return null;
  }

  const navStart = markTime("monitor_navigation_start") ?? 0;
  const html = markTime("monitor_html_received");
  const hydration = markTime("monitor_hydration_complete");
  const firstTicker = markTime("monitor_first_visible_ticker");
  const interactive = markTime("monitor_interactive");

  const metrics: MonitorLoadMetrics = {
    criticalJavaScriptBytes: sumCriticalScriptBytes(),
    routePrefetchMs: lastPrefetchMs,
    initialPageTransferBytes: initialDocumentTransferBytes(),
    hydrationDurationMs:
      html != null && hydration != null ? hydration - html : null,
    timeToFirstVisibleTickerMs:
      firstTicker != null ? firstTicker - navStart : null,
    timeToInteractiveMs:
      interactive != null ? interactive - navStart : null,
    routePrefetchHref: lastPrefetchHref,
    collectedAtMs: Date.now(),
  };

  window.__MONITOR_PERF_METRICS__ = metrics;
  return metrics;
}
